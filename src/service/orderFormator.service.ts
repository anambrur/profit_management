/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import orderModel from '../order/order.model.js';
import productHistoryModel from '../productHistory/productHistory.model.js';
import stockAlertModel from '../error_handaler/stockAlert.model.js';
import failedOrderModel from '../error_handaler/failedOrder.model.js';
import mongoose from 'mongoose';

async function transformOrdersData(
  orders: any[],
  storeId: string,
  storeObjectId: Types.ObjectId
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!orders.length) {
      return {
        stockedAlerts: [],
        failedOrders: [],
        skippedOrders: [],
        createdOrders: [],
      };
    }

    const stockedAlerts: any[] = [];
    const failedOrders: any[] = [];
    const skippedOrders: any[] = [];
    const ordersToCreate: any[] = [];

    // Phase 1: Pre-fetch all necessary data
    const customerOrderIds = orders.map((o) => o.customerOrderId);
    const allSkus = new Set<string>();
    const orderLineMap = new Map<
      string,
      { sku: string; quantity: number; line: any }[]
    >();

    // Build map of all SKUs and their quantities needed per order
    for (const order of orders) {
      const orderLines = order.orderLines?.orderLine || [];
      const lines: { sku: string; quantity: number; line: any }[] = [];

      for (const line of orderLines) {
        const sku = line.item?.sku || '';
        if (sku) {
          allSkus.add(sku);
          const quantityNeeded = Math.max(
            1,
            parseInt(line.orderLineQuantity?.amount || '1', 10)
          );
          lines.push({ sku, quantity: quantityNeeded, line });
        }
      }
      orderLineMap.set(order.customerOrderId, lines);
    }

    // Pre-fetch all data in parallel
    const [existingOrders, existingAlerts, existingFailures, allHistories] =
      await Promise.all([
        orderModel
          .find(
            { customerOrderId: { $in: customerOrderIds } },
            { customerOrderId: 1, _id: 0 }
          )
          .lean(),
        stockAlertModel
          .find(
            { storeId, orderId: { $in: customerOrderIds } },
            { orderId: 1, sku: 1, reason: 1 }
          )
          .lean(),
        failedOrderModel
          .find(
            { storeId, orderId: { $in: customerOrderIds } },
            { orderId: 1, reason: 1 }
          )
          .lean(),
        productHistoryModel
          .find({
            storeID: storeObjectId,
            upc: { $in: Array.from(allSkus) },
            costOfPrice: { $gt: 0 },
          })
          .sort({ costOfPrice: 1, date: 1 })
          .lean(),
      ]);

    // Create lookup maps
    const existingOrderIds = new Set(
      existingOrders.map((o) => o.customerOrderId)
    );
    const existingAlertMap = new Map(
      existingAlerts.map((a) => [`${a.orderId}_${a.sku}_${a.reason}`, true])
    );
    const existingFailureMap = new Map(
      existingFailures.map((f) => [`${f.orderId}_${f.reason}`, true])
    );
    const historiesBySku = new Map<string, any[]>();

    for (const history of allHistories) {
      const upc = history.upc ?? '';
      if (!historiesBySku.has(upc)) {
        historiesBySku.set(upc, []);
      }
      historiesBySku.get(upc)!.push(history);
    }

    // Process orders
    for (const order of orders) {
      try {
        if (existingOrderIds.has(order.customerOrderId)) {
          skippedOrders.push({
            orderId: order.customerOrderId,
            reason: 'DUPLICATE_ORDER',
          });
          continue;
        }

        const orderLines = orderLineMap.get(order.customerOrderId) || [];
        const productsInOrder = [];
        let hasInvalidProduct = false;

        // First pass: Check all products have sufficient quantity
        for (const { sku, quantity } of orderLines) {
          const histories = historiesBySku.get(sku) || [];

          // Case 1: No history found at all
          if (histories.length === 0) {
            const alertKey = `${order.customerOrderId}_${sku}_PRODUCT_NOT_IN_HISTORY`;
            if (!existingAlertMap.has(alertKey)) {
              stockedAlerts.push({
                orderId: order.customerOrderId,
                sku,
                reason: 'PRODUCT_NOT_IN_HISTORY',
                details: 'No purchase history exists for this product',
                quantityNeeded: quantity,
              });
              existingAlertMap.set(alertKey, true);
            }
            hasInvalidProduct = true;
            break;
          }

          const totalAvailable = histories.reduce(
            (sum, h) => sum + Math.max(0, h.purchaseQuantity - h.orderQuantity),
            0
          );

          // Case 2: Insufficient quantity
          if (totalAvailable < quantity) {
            const alertKey = `${order.customerOrderId}_${sku}_INSUFFICIENT_QUANTITY`;
            if (!existingAlertMap.has(alertKey)) {
              stockedAlerts.push({
                orderId: order.customerOrderId,
                sku,
                reason: 'INSUFFICIENT_QUANTITY',
                details: `Only ${totalAvailable} units available, need ${quantity}`,
                quantityNeeded: quantity,
              });
              existingAlertMap.set(alertKey, true);
            }
            hasInvalidProduct = true;
            break;
          }
        }

        if (hasInvalidProduct) {
          continue;
        }

        // Second pass: Allocate quantities
        const updateOperations = [];

        for (const { sku, quantity, line } of orderLines) {
          const histories = [...(historiesBySku.get(sku) || [])]; // Clone array
          let remainingNeeded = quantity;
          let bestHistory: any = null;

          for (const history of histories) {
            if (remainingNeeded <= 0) break;

            const available = history.purchaseQuantity - history.orderQuantity;
            if (available <= 0) continue;

            if (!bestHistory) {
              bestHistory = history;
            }

            const allocate = Math.min(available, remainingNeeded);
            remainingNeeded -= allocate;

            // Prepare update operation
            updateOperations.push({
              updateOne: {
                filter: { _id: history._id, storeID: storeObjectId },
                update: { $inc: { orderQuantity: allocate } },
              },
            });

            // Update local copy to reflect allocation
            history.orderQuantity += allocate;
          }

          // Add product to order
          const productCharge = line.charges?.charge?.find(
            (c: any) => c.chargeType === 'PRODUCT'
          );
          const shippingCharge = line.charges?.charge?.find(
            (c: any) => c.chargeType === 'SHIPPING'
          );

          productsInOrder.push({
            quantity,
            productName: line.item?.productName || 'Unknown Product',
            imageUrl: line.item?.imageUrl || '',
            productSKU: sku,
            PurchasePrice: bestHistory.costOfPrice.toFixed(2),
            sellPrice: productCharge?.chargeAmount?.amount?.toString() || '0',
            tax: productCharge?.tax?.taxAmount?.amount?.toString() || '0',
            shipping: shippingCharge?.chargeAmount?.amount?.toString() || '0',
          });
        }

        // Execute all updates for this order in bulk
        if (updateOperations.length > 0) {
          await productHistoryModel.bulkWrite(updateOperations, { session });
        }

        // Prepare order data
        const address = order.shippingInfo?.postalAddress || {};
        const statusHistory =
          orderLines[0]?.line?.orderLineStatuses?.orderLineStatus || [];
        const currentStatus =
          statusHistory.length > 0
            ? statusHistory[statusHistory.length - 1].status
            : 'Unknown';

        ordersToCreate.push({
          storeId: order.storeId,
          shipNodeType: order.shipNodeType,
          customerOrderId: order.customerOrderId,
          status: currentStatus,
          orderDate: new Date(order.orderDate),
          customerName: address.name || 'Unknown Customer',
          customerAddress: [
            address.address1,
            address.address2,
            `${address.city}, ${address.state} ${address.postalCode}`,
            address.country,
          ]
            .filter(Boolean)
            .join('\n'),
          products: productsInOrder,
        });
      } catch (error) {
        const failureKey = `${order.customerOrderId}_PROCESSING_ERROR`;
        if (!existingFailureMap.has(failureKey)) {
          failedOrders.push({
            orderId: order.customerOrderId,
            reason: 'PROCESSING_ERROR',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          existingFailureMap.set(failureKey, true);
        }
        continue;
      }
    }

    // Execute remaining bulk operations
    const writePromises: Promise<any>[] = [];

    if (ordersToCreate.length > 0) {
      writePromises.push(orderModel.insertMany(ordersToCreate, { session }));
    }

    if (stockedAlerts.length > 0) {
      const alertBulkOps = stockedAlerts.map((alert) => ({
        updateOne: {
          filter: {
            storeId,
            orderId: alert.orderId,
            sku: alert.sku,
            reason: alert.reason,
          },
          update: {
            $setOnInsert: {
              storeObjectId,
              details: alert.details,
              quantityNeeded: alert.quantityNeeded,
              date: new Date(),
            },
          },
          upsert: true,
        },
      }));
      writePromises.push(stockAlertModel.bulkWrite(alertBulkOps, { session }));
    }

    if (failedOrders.length > 0) {
      const failureBulkOps = failedOrders.map((failure) => ({
        updateOne: {
          filter: {
            storeId,
            orderId: failure.orderId,
            reason: failure.reason,
          },
          update: {
            $setOnInsert: {
              storeObjectId,
              error: failure.error,
              sku: failure.sku || null,
              date: new Date(),
            },
          },
          upsert: true,
        },
      }));
      writePromises.push(
        failedOrderModel.bulkWrite(failureBulkOps, { session })
      );
    }

    await Promise.all(writePromises);
    await session.commitTransaction();
    session.endSession();

    return {
      stockedAlerts,
      failedOrders,
      skippedOrders,
      createdOrders: ordersToCreate,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Transaction aborted due to error:', error);
    throw error;
  }
}

export default transformOrdersData;

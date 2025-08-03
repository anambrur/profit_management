/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import orderModel from '../order/order.model.js';
import productModel from '../product/product.model.js';
import productHistoryModel from '../productHistory/productHistory.model.js';
import stockAlertModel from '../error_handaler/stockAlert.model.js';
import failedOrderModel from '../error_handaler/failedOrder.model.js';

async function transformOrdersData(
  orders: any[],
  storeId: string,
  storeObjectId: Types.ObjectId
) {
  // Clear previous records for this store
  await Promise.all([
    stockAlertModel.deleteMany({ storeId }),
    failedOrderModel.deleteMany({ storeId }),
  ]);
  // Initialize result arrays
  const stockedAlerts: any[] = [];
  const failedOrders: any[] = [];
  const skippedOrders: any[] = [];
  const ordersToCreate: any[] = [];

  // Phase 1: Pre-fetch all necessary data
  const customerOrderIds = orders.map((o) => o.customerOrderId);
  const allSkus = new Set<string>();

  // Collect all SKUs from all orders
  orders.forEach((order) => {
    order.orderLines?.orderLine?.forEach((line: any) => {
      const sku = line.item?.sku || '';
      if (sku) allSkus.add(sku);
    });
  });

  // Parallel fetch operations
  const [existingOrders, products] = await Promise.all([
    // Check for existing orders
    orderModel
      .find({
        customerOrderId: { $in: customerOrderIds },
      })
      .select('customerOrderId')
      .lean(),

    // Get all products needed
    productModel.find({
      storeId,
      $or: [
        { sku: { $in: Array.from(allSkus) } },
        { upc: { $in: Array.from(allSkus) } },
      ],
    }),
  ]);

  // Create lookup maps
  const existingOrderIds = new Set(
    existingOrders.map((o) => o.customerOrderId)
  );
  const productsMap = new Map(products.map((p) => [p.sku, p]));

  // Prepare bulk updates
  const bulkUpdates = {
    products: [] as any[],
  };

  // Process all orders in single loop
  for (const order of orders) {
    try {
      // Skip duplicate orders
      if (existingOrderIds.has(order.customerOrderId)) {
        skippedOrders.push({
          orderId: order.customerOrderId,
          reason: 'Duplicate customerOrderId',
        });
        continue;
      }

      const productsInOrder = [];
      let hasInsufficientStock = false;

      // Process each order line
      for (const line of order.orderLines?.orderLine || []) {
        const sku = line.item?.sku || '';
        const quantityNeeded = parseInt(
          line.orderLineQuantity?.amount || '1',
          10
        );
        const product = productsMap.get(sku);

        if (!product) {
          failedOrders.push({
            orderId: order.customerOrderId,
            sku,
            reason: 'Product not found in inventory',
          });
          hasInsufficientStock = true;
          break;
        }

        // Get product histories
        const productHistories = await productHistoryModel
          .find({
            storeID: storeObjectId,
            productId: product._id,
            purchaseQuantity: { $gt: 0 },
          })
          .sort({
            costOfPrice: 1,
            date: 1,
          })
          .lean();

        let remainingQuantity = quantityNeeded;
        let purchasePrice = 0;

        // Allocate inventory
        for (const history of productHistories) {
          if (remainingQuantity <= 0) break;

          const availableQuantity = parseInt(
            String(history.purchaseQuantity),
            10
          );
          const quantityToTake = Math.min(remainingQuantity, availableQuantity);

          if (purchasePrice === 0) {
            purchasePrice = parseFloat(history.costOfPrice.toString());
          }

          bulkUpdates.products.push({
            updateOne: {
              filter: { _id: product._id },
              update: { $inc: { available: -quantityToTake } },
            },
          });

          remainingQuantity -= quantityToTake;
        }

        if (remainingQuantity > 0) {
          stockedAlerts.push({
            orderId: order.customerOrderId,
            sku,
            reason: `Insufficient inventory (Need ${quantityNeeded}, Available ${quantityNeeded - remainingQuantity})`,
          });
          hasInsufficientStock = true;
          break;
        }

        productsInOrder.push({
          quantity: quantityNeeded,
          productName: line.item?.productName || 'Unknown Product',
          imageUrl: line.item?.imageUrl || '',
          productSKU: sku,
          PurchasePrice: purchasePrice.toFixed(2),
          sellPrice:
            line.charges?.charge
              ?.find((c: any) => c.chargeType === 'PRODUCT')
              ?.chargeAmount?.amount?.toString() || '0',
          tax:
            line.charges?.charge
              ?.find((c: any) => c.chargeType === 'PRODUCT')
              ?.tax?.taxAmount?.amount?.toString() || '0',
          shipping:
            line.charges?.charge
              ?.find((c: any) => c.chargeType === 'SHIPPING')
              ?.chargeAmount?.amount?.toString() || '0',
        });
      }

      if (hasInsufficientStock) {
        continue;
      }

      // Prepare order data
      const customerName =
        order.shippingInfo?.postalAddress?.name || 'Unknown Customer';
      const address = order.shippingInfo?.postalAddress;
      const customerAddress = [
        address?.address1,
        address?.address2,
        `${address?.city}, ${address?.state} ${address?.postalCode}`,
        address?.country,
      ]
        .filter(Boolean)
        .join('\n');

      const statusHistory =
        order.orderLines?.orderLine?.[0]?.orderLineStatuses?.orderLineStatus ||
        [];
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
        customerName,
        customerAddress,
        products: productsInOrder,
      });
    } catch (error) {
      failedOrders.push({
        orderId: order.customerOrderId,
        reason: 'Processing error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      continue;
    }
  }

  // Execute bulk operations
  if (bulkUpdates.products.length > 0) {
    try {
      const bulkResult = await productModel.bulkWrite(bulkUpdates.products);
      console.log(`Updated ${bulkResult.modifiedCount} products`);
    } catch (error) {
      console.error('Product bulk update failed:', error);
      throw error;
    }
  }

  // Insert all valid orders
  if (ordersToCreate.length > 0) {
    try {
      const result = await orderModel.insertMany(ordersToCreate);
      console.log(`Successfully inserted ${result.length} orders`);
    } catch (error) {
      console.error('Order insertion failed:', error);
      throw error;
    }
  }

  // After processing all orders, insert the alerts and failures
  if (stockedAlerts.length > 0) {
    const alertDocs = stockedAlerts.map((alert) => ({
      storeId,
      storeObjectId,
      orderId: alert.orderId,
      sku: alert.sku,
      reason: alert.reason,
      quantityNeeded: parseInt(alert.reason.match(/Need (\d+)/)?.[1] || 1),
      quantityAvailable: parseInt(
        alert.reason.match(/Available (\d+)/)?.[1] || 0
      ),
    }));
    await stockAlertModel.insertMany(alertDocs);

    if (failedOrders.length > 0) {
      const failureDocs = failedOrders.map((failure) => ({
        storeId,
        storeObjectId,
        orderId: failure.orderId,
        reason: failure.reason,
        error: failure.error,
        sku: failure.sku || null,
      }));
      await failedOrderModel.insertMany(failureDocs);
    }
  }

  return {
    stockedAlerts,
    failedOrders,
    skippedOrders,
    createdOrders: ordersToCreate,
  };
}

export default transformOrdersData;

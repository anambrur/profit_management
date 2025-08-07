/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import orderModel from '../order/order.model.js';
import productHistoryModel from '../productHistory/productHistory.model.js';
import stockAlertModel from '../error_handaler/stockAlert.model.js';
import failedOrderModel from '../error_handaler/failedOrder.model.js';

async function transformOrdersData(
  orders: any[],
  storeId: string,
  storeObjectId: Types.ObjectId
) {
  // Early return if no orders to process
  if (!orders.length) {
    return {
      stockedAlerts: [],
      failedOrders: [],
      skippedOrders: [],
      createdOrders: [],
    };
  }

  // Initialize result arrays with estimated capacity
  const initialCapacity = Math.ceil(orders.length * 0.3); // Estimate 30% might have issues
  const stockedAlerts: any[] = new Array(initialCapacity);
  const failedOrders: any[] = new Array(initialCapacity);
  const skippedOrders: any[] = new Array(initialCapacity);
  const ordersToCreate: any[] = new Array(orders.length);

  let alertCount = 0;
  let failureCount = 0;
  let skipCount = 0;
  let createCount = 0;

  // Phase 1: Pre-fetch all necessary data in parallel
  const customerOrderIds = orders.map((o) => o.customerOrderId);
  const allSkus = new Set<string>();

  // Collect all SKUs from all orders using for-of for better performance
  for (const order of orders) {
    const orderLines = order.orderLines?.orderLine || [];
    for (const line of orderLines) {
      const sku = line.item?.sku || '';
      if (sku) allSkus.add(sku);
    }
  }

  // Parallel fetch operations with optimized queries
  const [existingOrders, productHistories, existingAlerts, existingFailures] =
    await Promise.all([
      // Only get customerOrderId for existing orders check
      orderModel
        .find(
          { customerOrderId: { $in: customerOrderIds } },
          { customerOrderId: 1, _id: 0 }
        )
        .lean(),

      // Get only needed fields for product histories
      productHistoryModel
        .find(
          { storeID: storeObjectId, upc: { $in: Array.from(allSkus) } },
          { upc: 1, costOfPrice: 1, purchaseQuantity: 1, date: 1 }
        )
        .lean(),

      // Get minimal data for existing alerts
      stockAlertModel
        .find(
          { storeId, orderId: { $in: customerOrderIds } },
          { orderId: 1, sku: 1, reason: 1 }
        )
        .lean(),

      // Get minimal data for existing failures
      failedOrderModel
        .find(
          { storeId, orderId: { $in: customerOrderIds } },
          { orderId: 1, reason: 1 }
        )
        .lean(),
    ]);

  // Create optimized lookup structures
  const existingOrderIds = new Set(
    existingOrders.map((o) => o.customerOrderId)
  );
  const existingAlertMap = new Map(
    existingAlerts.map((a) => [`${a.orderId}_${a.sku}_${a.reason}`, true])
  );
  const existingFailureMap = new Map(
    existingFailures.map((f) => [`${f.orderId}_${f.reason}`, true])
  );

  // Group histories by UPC using a more efficient approach
  const productHistoriesMap = new Map<string, any[]>();
  for (const history of productHistories) {
    if (!history.upc) continue;
    if (!productHistoriesMap.has(history.upc)) {
      productHistoriesMap.set(history.upc, []);
    }
    productHistoriesMap.get(history.upc)!.push(history);
  }

  // Process orders with optimized logic
  for (const order of orders) {
    try {
      // Skip duplicate orders
      if (existingOrderIds.has(order.customerOrderId)) {
        skippedOrders[skipCount++] = {
          orderId: order.customerOrderId,
          reason: 'DUPLICATE_ORDER',
        };
        continue;
      }

      const productsInOrder = [];
      let hasInvalidProduct = false;
      const orderLines = order.orderLines?.orderLine || [];

      // Process each order line
      for (const line of orderLines) {
        const sku = line.item?.sku || '';
        const quantityNeeded = parseInt(
          line.orderLineQuantity?.amount || '1',
          10
        );
        const histories = productHistoriesMap.get(sku);

        // Common function to handle alert cases
        const handleAlertCase = (reason: string, details: string) => {
          const alertKey = `${order.customerOrderId}_${sku}_${reason}`;
          if (!existingAlertMap.has(alertKey)) {
            stockedAlerts[alertCount++] = {
              orderId: order.customerOrderId,
              sku,
              reason,
              details,
              quantityNeeded,
            };
            existingAlertMap.set(alertKey, true);
          }
          hasInvalidProduct = true;
        };

        // Case 1: No history found at all
        if (!histories || histories.length === 0) {
          handleAlertCase(
            'PRODUCT_NOT_IN_HISTORY',
            'No purchase history exists for this product'
          );
          break;
        }

        // Case 2: All histories have costOfPrice = 0
        const allZeroCost = histories.every((h) => h.costOfPrice === 0);
        if (allZeroCost) {
          handleAlertCase(
            'ZERO_COST_PRODUCT',
            'All purchase histories have costOfPrice = 0'
          );
          break;
        }

        // Case 3: All histories have purchaseQuantity = 0
        const allZeroQuantity = histories.every(
          (h) => h.purchaseQuantity === 0
        );
        if (allZeroQuantity) {
          handleAlertCase(
            'ZERO_QUANTITY_PRODUCT',
            'All purchase histories have purchaseQuantity = 0'
          );
          break;
        }

        // Case 4: Find valid histories (cost > 0 AND quantity > 0)
        const validHistories = histories.filter(
          (h) => h.costOfPrice > 0 && h.purchaseQuantity > 0
        );

        if (validHistories.length === 0) {
          handleAlertCase(
            'NO_VALID_HISTORIES',
            'No histories with both costOfPrice > 0 AND purchaseQuantity > 0'
          );
          break;
        }

        // Select history with lowest cost (then oldest date)
        const bestHistory = validHistories.reduce((prev, curr) => {
          if (prev.costOfPrice < curr.costOfPrice) return prev;
          if (prev.costOfPrice > curr.costOfPrice) return curr;
          return new Date(prev.date) < new Date(curr.date) ? prev : curr;
        });

        // Extract charge information more efficiently
        const productCharge = line.charges?.charge?.find(
          (c: any) => c.chargeType === 'PRODUCT'
        );
        const shippingCharge = line.charges?.charge?.find(
          (c: any) => c.chargeType === 'SHIPPING'
        );

        productsInOrder.push({
          quantity: quantityNeeded,
          productName: line.item?.productName || 'Unknown Product',
          imageUrl: line.item?.imageUrl || '',
          productSKU: sku,
          PurchasePrice: bestHistory.costOfPrice.toFixed(2),
          sellPrice: productCharge?.chargeAmount?.amount?.toString() || '0',
          tax: productCharge?.tax?.taxAmount?.amount?.toString() || '0',
          shipping: shippingCharge?.chargeAmount?.amount?.toString() || '0',
        });
      }

      if (hasInvalidProduct) {
        continue;
      }

      // Prepare order data more efficiently
      const address = order.shippingInfo?.postalAddress || {};
      const statusHistory =
        orderLines[0]?.orderLineStatuses?.orderLineStatus || [];
      const currentStatus =
        statusHistory.length > 0
          ? statusHistory[statusHistory.length - 1].status
          : 'Unknown';

      ordersToCreate[createCount++] = {
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
      };
    } catch (error) {
      const failureKey = `${order.customerOrderId}_PROCESSING_ERROR`;
      if (!existingFailureMap.has(failureKey)) {
        failedOrders[failureCount++] = {
          orderId: order.customerOrderId,
          reason: 'PROCESSING_ERROR',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        existingFailureMap.set(failureKey, true);
      }
      continue;
    }
  }

  // Trim the arrays to actual used length
  stockedAlerts.length = alertCount;
  failedOrders.length = failureCount;
  skippedOrders.length = skipCount;
  ordersToCreate.length = createCount;

  // Use bulk operations for database writes
  const writePromises: Promise<any>[] = [];

  // Insert all valid orders in bulk if any
  if (ordersToCreate.length > 0) {
    writePromises.push(
      orderModel
        .insertMany(ordersToCreate)
        .then((result) =>
          console.log(`Successfully inserted ${result.length} orders`)
        )
        .catch((error) => {
          console.error('Order insertion failed:', error);
          throw error;
        })
    );
  }

  // Process alerts with bulkWrite if any
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

    writePromises.push(stockAlertModel.bulkWrite(alertBulkOps));
  }

  // Process failures with bulkWrite if any
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

    writePromises.push(failedOrderModel.bulkWrite(failureBulkOps));
  }

  // Execute all database writes in parallel
  await Promise.all(writePromises);

  return {
    stockedAlerts,
    failedOrders,
    skippedOrders,
    createdOrders: ordersToCreate,
  };
}

export default transformOrdersData;

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
  // Clear previous records for this store
  await Promise.all([
    stockAlertModel.deleteMany({ storeId }),
    failedOrderModel.deleteMany({ storeId }),
  ]);

  // Initialize result arrays
  const stockedAlerts: any[] = []; // For inventory-related issues
  const failedOrders: any[] = []; // For processing errors
  const skippedOrders: any[] = []; // For duplicate orders
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
  const [existingOrders, productHistories] = await Promise.all([
    // Check for existing orders
    orderModel
      .find({
        customerOrderId: { $in: customerOrderIds },
      })
      .select('customerOrderId')
      .lean(),

    // Get all product histories needed
    productHistoryModel.find({
      storeID: storeObjectId,
      upc: { $in: Array.from(allSkus) },
    }),
  ]);

  // Create lookup maps
  const existingOrderIds = new Set(
    existingOrders.map((o) => o.customerOrderId)
  );
  const productHistoriesMap = new Map<string, any[]>();

  // Group histories by UPC
  productHistories.forEach((history) => {
    if (history.upc) {
      if (!productHistoriesMap.has(history.upc)) {
        productHistoriesMap.set(history.upc, []);
      }
      productHistoriesMap.get(history.upc)?.push(history);
    }
  });

  // Process all orders in single loop
  for (const order of orders) {
    try {
      // Skip duplicate orders
      if (existingOrderIds.has(order.customerOrderId)) {
        skippedOrders.push({
          orderId: order.customerOrderId,
          reason: 'DUPLICATE_ORDER',
        });
        continue;
      }

      const productsInOrder = [];
      let hasInvalidProduct = false;

      // Process each order line
      for (const line of order.orderLines?.orderLine || []) {
        const sku = line.item?.sku || '';
        const quantityNeeded = parseInt(
          line.orderLineQuantity?.amount || '1',
          10
        );

        const histories = productHistoriesMap.get(sku);

        // Case 1: No history found at all
        if (!histories || histories.length === 0) {
          stockedAlerts.push({
            orderId: order.customerOrderId,
            sku,
            reason: 'PRODUCT_NOT_IN_HISTORY',
            details: 'No purchase history exists for this product',
          });
          hasInvalidProduct = true;
          break;
        }

        // Case 2: All histories have costOfPrice = 0
        const allZeroCost = histories.every((h) => h.costOfPrice === 0);
        if (allZeroCost) {
          stockedAlerts.push({
            orderId: order.customerOrderId,
            sku,
            reason: 'ZERO_COST_PRODUCT',
            details: 'All purchase histories have costOfPrice = 0',
          });
          hasInvalidProduct = true;
          break;
        }

        // Case 3: All histories have purchaseQuantity = 0
        const allZeroQuantity = histories.every(
          (h) => h.purchaseQuantity === 0
        );
        if (allZeroQuantity) {
          stockedAlerts.push({
            orderId: order.customerOrderId,
            sku,
            reason: 'ZERO_QUANTITY_PRODUCT',
            details: 'All purchase histories have purchaseQuantity = 0',
          });
          hasInvalidProduct = true;
          break;
        }

        // Case 4: Find valid histories (cost > 0 AND quantity > 0)
        const validHistories = histories.filter(
          (h) => h.costOfPrice > 0 && h.purchaseQuantity > 0
        );

        if (validHistories.length === 0) {
          stockedAlerts.push({
            orderId: order.customerOrderId,
            sku,
            reason: 'NO_VALID_HISTORIES',
            details:
              'No histories with both costOfPrice > 0 AND purchaseQuantity > 0',
          });
          hasInvalidProduct = true;
          break;
        }

        // Select history with lowest cost (then oldest date)
        const bestHistory = validHistories.sort((a, b) => {
          if (a.costOfPrice !== b.costOfPrice) {
            return a.costOfPrice - b.costOfPrice;
          }
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        })[0];

        productsInOrder.push({
          quantity: quantityNeeded,
          productName: line.item?.productName || 'Unknown Product',
          imageUrl: line.item?.imageUrl || '',
          productSKU: sku,
          PurchasePrice: bestHistory.costOfPrice.toFixed(2),
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

      if (hasInvalidProduct) {
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
        reason: 'PROCESSING_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      continue;
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
      details: alert.details,
      type: 'STOCK_ALERT', // Added type for easier filtering
    }));
    await stockAlertModel.insertMany(alertDocs);
  }

  if (failedOrders.length > 0) {
    const failureDocs = failedOrders.map((failure) => ({
      storeId,
      storeObjectId,
      orderId: failure.orderId,
      reason: failure.reason,
      error: failure.error,
      sku: failure.sku || null,
      type: 'PROCESSING_ERROR', // Added type for easier filtering
    }));
    await failedOrderModel.insertMany(failureDocs);
  }

  return {
    stockedAlerts,
    failedOrders,
    skippedOrders,
    createdOrders: ordersToCreate,
  };
}

export default transformOrdersData;

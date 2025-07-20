/* eslint-disable @typescript-eslint/no-explicit-any */
// orderFormator.service.ts
import orderModel from '../order/order.model.js';
import productModel from '../product/product.model.js';
import productHistoryModel from '../productHistory/productHistory.model.js'; // Import the new model


async function transformOrdersData(orders: any[]) {
  // Initialize result arrays
  const stockedAlerts: any[] = [];
  const failedOrders: any[] = [];
  const skippedOrders: any[] = [];
  const ordersToCreate: any[] = [];

  // Phase 1: Pre-fetch all necessary data in bulk
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
    productModel.find({ sku: { $in: Array.from(allSkus) } }),
  ]);

  // Create lookup maps
  const existingOrderIds = new Set(
    existingOrders.map((o) => o.customerOrderId)
  );
  const productsMap = new Map(products.map((p) => [p.sku, p]));

  // Phase 2: Process orders in batches
  const batchSize = 100;
  for (let i = 0; i < orders.length; i += batchSize) {
    const batch = orders.slice(i, i + batchSize);
    const batchUpdates = {
      productHistory: [] as any[],
      products: [] as any[],
      orders: [] as any[],
    };

    for (const order of batch) {
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

          // Get product histories (already pre-fetched)
          const productHistories = await productHistoryModel
            .find({
              productId: product._id,
              receiveQuantity: { $gt: 0 },
            })
            .sort({
              costOfPrice: 1,
              date: 1,
            })
            .lean();

          let remainingQuantity = quantityNeeded;
          let purchasePrice = 0;
          const historyUpdates = [];

          // Allocate inventory
          for (const history of productHistories) {
            if (remainingQuantity <= 0) break;

            const availableQuantity = parseInt(
              String(history.receiveQuantity - history.lostQuantity),
              10
            );
            const quantityToTake = Math.min(
              remainingQuantity,
              availableQuantity
            );

            if (purchasePrice === 0) {
              purchasePrice = parseFloat(history.costOfPrice.toString());
            }

            historyUpdates.push({
              historyId: history._id,
              quantityTaken: quantityToTake,
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

          // Prepare bulk updates
          historyUpdates.forEach((update) => {
            batchUpdates.productHistory.push({
              updateOne: {
                filter: { _id: update.historyId },
                update: { $inc: { quantity: -update.quantityTaken } },
              },
            });

            batchUpdates.products.push({
              updateOne: {
                filter: { _id: product._id },
                update: { $inc: { available: -update.quantityTaken } },
              },
            });
          });

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
          order.orderLines?.orderLine?.[0]?.orderLineStatuses
            ?.orderLineStatus || [];
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

    // Execute all bulk operations
    try {
      await Promise.all([
        productHistoryModel.bulkWrite(batchUpdates.productHistory),
        productModel.bulkWrite(batchUpdates.products),
      ]);
    } catch (error) {
      console.error('Bulk operation failed:', error);
    }
  }

  // Phase 3: Bulk insert all valid orders
  if (ordersToCreate.length > 0) {
    try {
      await orderModel.insertMany(ordersToCreate, { ordered: false });
    } catch (error) {
      failedOrders.push(
        ...ordersToCreate.map((order) => ({
          orderId: order.customerOrderId,
          reason: 'Database insertion failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        }))
      );
      ordersToCreate.length = 0;
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

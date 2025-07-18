/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// orderFormator.service.ts
import orderModel from '../order/order.model.js';
import productModel from '../product/product.model.js';
import productHistoryModel from '../productHistory/productHistory.model.js'; // Import the new model

async function transformOrdersData(orders: any[]) {
  const stockedAlerts: any[] = [];
  const failedOrders: any[] = [];
  const skippedOrders: any[] = [];
  const ordersToCreate: any[] = [];

  for (const order of orders) {
    try {
      // Check if order already exists
      const existingOrder = await orderModel
        .findOne({
          customerOrderId: order.customerOrderId,
        })
        .exec();

      if (existingOrder) {
        skippedOrders.push({
          orderId: order.customerOrderId,
          reason: 'Duplicate customerOrderId',
        });
        continue;
      }

      const products = [];
      let hasInsufficientStock = false;

      for (const line of order.orderLines?.orderLine || []) {
        const sku = line.item?.sku || '';
        const quantityNeeded = parseInt(
          line.orderLineQuantity?.amount || '1',
          10
        );

        // Find the product in your collection
        const product = await productModel.findOne({ sku }).exec();

        if (!product) {
          failedOrders.push({
            orderId: order.customerOrderId,
            sku,
            reason: 'Product not found in inventory',
          });
          hasInsufficientStock = true;
          break;
        }

        // Get purchase histories for this product from the separate collection
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
        const updates = [];

        // Allocate from cheapest inventory first
        for (const history of productHistories) {
          if (remainingQuantity <= 0) break;

          const quantityToTake = Math.min(
            remainingQuantity,
            parseInt(String(history.receiveQuantity - history.lostQuantity), 10)
          );

          if (purchasePrice === 0) {
            purchasePrice = parseFloat(history.costOfPrice.toString());
          }

          updates.push({
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

        // Apply all quantity updates to the database
        for (const update of updates) {
          await productHistoryModel.updateOne(
            { _id: update.historyId },
            {
              $inc: {
                quantity: -update.quantityTaken,
              },
            }
          );

          // Also update the product's available quantity
          await productModel.updateOne(
            { _id: product._id },
            {
              $inc: {
                available: -update.quantityTaken,
              },
            }
          );
        }

        products.push({
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

      // Prepare order data for creation
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
        products,
      });
    } catch (error) {
      failedOrders.push({
        orderId: order.customerOrderId,
        reason: 'Processing error',
        // @ts-ignore
        error: error.message,
      });
      continue;
    }
  }

  // Create all valid orders in bulk
  if (ordersToCreate.length > 0) {
    try {
      await orderModel.insertMany(ordersToCreate);
    } catch (error) {
      failedOrders.push(
        ...ordersToCreate.map((order) => ({
          orderId: order.customerOrderId,
          reason: 'Database insertion failed',
          // @ts-ignore
          error: error.message,
        }))
      );
      ordersToCreate.length = 0; // Clear the array since insertion failed
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

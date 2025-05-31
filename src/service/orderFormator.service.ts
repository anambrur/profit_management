// orderFormator.service.ts
import productModel from '../product/product.model';
import orderModel from '../order/order.model';

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

        // Sort purchases by price (lowest first) and then by date (oldest first)
        const sortedPurchases = [...product.purchaseHistory]
          .sort((a, b) => {
            if (a.costOfPrice !== b.costOfPrice) {
              return a.costOfPrice - b.costOfPrice;
            }
            return new Date(a.date) - new Date(b.date);
          })
          .filter((p) => p.quantity > 0);

        let remainingQuantity = quantityNeeded;
        let purchasePrice = 0;
        const updates = [];

        // Allocate from cheapest inventory first
        for (const purchase of sortedPurchases) {
          if (remainingQuantity <= 0) break;

          const quantityToTake = Math.min(remainingQuantity, purchase.quantity);

          if (purchasePrice === 0) {
            purchasePrice = purchase.costOfPrice;
          }

          updates.push({
            purchaseId: purchase._id,
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
          await productModel.updateOne(
            {
              _id: product._id,
              'purchaseHistory._id': update.purchaseId,
            },
            {
              $inc: {
                'purchaseHistory.$.quantity': -update.quantityTaken,
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

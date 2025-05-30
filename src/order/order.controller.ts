/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import orderModel from './order.model';
import productModel from '../product/product.model';
import syncOrdersFromAPI from '../service/syncOrderFromAPI.service';

// Transformation function
function transformOrdersData(orders: any[]) {
  return orders.map((order) => {
    const buyerName = order.buyerInfo?.primaryContact?.name;
    const address = order.orderLines[0]?.shipToAddress?.address;
    const primaryShipment = order.shipments?.[0];

    // Determine status display text
    let statusDisplay = 'Ready to Ship';
    if (order.status === 'SHIPPED') {
      statusDisplay = primaryShipment?.statusDescription || 'Shipped';
    } else if (order.status === 'DELIVERED') {
      statusDisplay = 'Delivered';
    }

    // Format dates
    const orderDate = new Date(order.orderDate);
    const formattedOrderDate = orderDate
      .toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
      .replace(',', '');

    // Calculate payload (sum of all items' values - mocked)
    const itemCount = order.orderLines.reduce((sum: number, line: any) => {
      return sum + (line.orderedQty?.measurementValue || 1);
    }, 0);
    const payloadValue = (itemCount * 10 + Math.random() * 40).toFixed(2); // Mock calculation

    return {
      orderId: order.sellerOrderId,
      status: statusDisplay,
      customer: buyerName
        ? `${buyerName.firstName} ${buyerName.lastName}`
        : 'Unknown Customer',
      location: address
        ? `${address.city}, ${address.stateOrProvinceCode}`
        : 'Unknown Location',
      orderDate: formattedOrderDate,
      packageInfo: {
        // These would normally come from another API endpoint
        weight: `${Math.floor(Math.random() * 16)} oz`, // Mock 0-15oz
        dimensions: '1 x 1 x 1 in', // Standard small package
      },
      shipping: {
        method: primaryShipment?.carrierDescription || 'USPS Ground Advantage',
        cost: (4 + Math.random()).toFixed(2), // Mock $4-5
        rate: '@$0.02', // Standard rate
      },
      payload: `$${payloadValue}`,
      shippingMethod: order.orderLines[0]?.shippingMethod || 'STANDARD',
      paidAmount: `$${(Number(payloadValue) * 0.8).toFixed(2)}`, // Mock 80% of payload
      products: order.orderLines.map((line: any) => ({
        name: line.orderProduct?.productName || 'Unknown Product',
        sku: line.orderProduct?.sku || 'Unknown SKU',
        quantity: line.orderedQty?.measurementValue || 1,
      })),
      trackingInfo:
        order.shipments?.map((shipment: any) => ({
          trackingNo: shipment.trackingNo,
          carrier: shipment.carrierDescription,
          status: shipment.statusDescription,
          url: shipment.externalTrackingURL,
        })) || [],
    };
  });
}

export const getAllOrders = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = req.params.id;

    if (!id) {
      res
        .status(400)
        .json({ message: 'Missing store ID parameter', success: false });
      return;
    }

    try {
      // 1. Fetch orders from API
      const result = await syncOrdersFromAPI(id);
      if (!result) {
        res.status(404).json({
          message: 'Store not found or credentials missing',
          success: false,
        });
        return;
      }
      if (result instanceof Error) throw result;

      // 2. Transform data (CPU-bound, but relatively fast)
      const transformedData = transformOrdersData(result as any[]);

      

      // 3. Prepare for batch processing
      const stockedAlerts: any[] = [];
      const failedOrders: any[] = [];
      const skippedOrders: any[] = [];
      const ordersToCreate: any[] = [];
      const productsToUpdate = new Map<string, any>();

      // 4. First pass: Check for existing orders (batch query)
      const orderIds = transformedData.map((order) => order.orderId);
      const existingOrders = await orderModel
        .find({
          sellerOrderId: { $in: orderIds },
        })
        .select('sellerOrderId')
        .lean();

      const existingOrderIds = new Set(
        existingOrders.map((o) => o.sellerOrderId)
      );

      // 5. Process orders in optimized batches
      for (const order of transformedData) {
        if (existingOrderIds.has(order.orderId)) {
          skippedOrders.push({
            orderId: order.orderId,
            reason: 'Duplicate sellerOrderId',
          });
          continue;
        }

        const simplifiedProducts = [];
        let hasValidProducts = false;

        for (const product of order.products) {
          const sku = product.sku?.toString();
          if (!sku) continue;

          let remainingQuantity = product.quantity || 0;
          if (remainingQuantity <= 0) continue;

          // Get or load product
          let storeProduct = productsToUpdate.get(sku);
          if (!storeProduct) {
            storeProduct = await productModel.findOne({ sku });
            if (storeProduct) productsToUpdate.set(sku, storeProduct);
          }

          if (!storeProduct) {
            // failedOrders.push({
            //   orderId: order.orderId,
            //   sku,
            //   reason: 'Product not found',
            // });
            continue;
          }

          // Process inventory
          const sortedHistory = [...storeProduct.purchaseHistory].sort(
            (a, b) => {
              if (a.costOfPrice === b.costOfPrice) {
                return new Date(a.date).getTime() - new Date(b.date).getTime();
              }
              return a.costOfPrice - b.costOfPrice;
            }
          );

          for (const history of sortedHistory) {
            if (remainingQuantity <= 0) break;

            const quantityToUse = Math.min(history.quantity, remainingQuantity);
            if (quantityToUse <= 0) continue;

            simplifiedProducts.push({
              quantity: quantityToUse,
              productName: storeProduct.productName || '',
              productSKU: storeProduct.sku || '',
              PurchasePrice: history.costOfPrice.toString(),
              sellPrice: history.sellPrice.toString(),
              purchaseHistoryId: history._id,
            });

            history.quantity -= quantityToUse;
            remainingQuantity -= quantityToUse;
            hasValidProducts = true;
          }

          if (remainingQuantity > 0) {
            stockedAlerts.push({
              orderId: order.orderId,
              sku,
              reason: `Insufficient stock (${remainingQuantity} remaining)`,
            });
          }
        }

        if (hasValidProducts) {
          ordersToCreate.push({
            sellerOrderId: order.orderId,
            status: order.status,
            orderDate: new Date(order.orderDate),
            customerName: order.customer,
            customerAddress: order.location,
            products: simplifiedProducts,
          });
        } else if (order.products.length > 0) {
          failedOrders.push({
            orderId: order.orderId,
            reason: 'No valid products',
          });
        }
      }

      // 6. Batch updates - do all database operations in parallel
      await Promise.all([
        // Create all orders in one batch
        orderModel.insertMany(ordersToCreate),

        // Update all products in one batch
        ...Array.from(productsToUpdate.values()).map((product) => {
          product.available = product.purchaseHistory.reduce(
            (sum: number, item: any) => sum + item.quantity,
            0
          );
          return product.save();
        }),
      ]);

      // 7. Send response
      res.status(200).json({
        message: 'Orders processed successfully',
        success: true,
        processedCount: ordersToCreate.length,
        stockedAlerts,
        failedOrders,
        skippedOrders,
      });
    } catch (error) {
      console.error('Error fetching or processing orders:', error);
      res.status(500).json({
        message: 'Internal server error while processing orders',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

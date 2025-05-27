/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import syncOrdersFromAPI from '../service/syncOrderFromAPI.service';
import productModel from '../product/product.model';
import orderModel from '../order/order.model';

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
      const result = await syncOrdersFromAPI(id);

      if (!result) {
        res.status(404).json({
          message: 'Store not found or credentials missing',
          success: false,
        });
        return;
      }

      if (result instanceof Error) {
        throw result;
      }

      const transformedData = transformOrdersData(result as any[]);

      const failedOrders: any[] = [];
      const skippedOrders: any[] = [];

      await Promise.all(
        transformedData.map(async (order: any) => {
          const simplifiedProducts = [];

          try {
            // ✅ Check for existing order
            const existingOrder = await orderModel.findOne({
              sellerOrderId: order.orderId,
            });

            if (existingOrder) {
              // console.info(
              //   `Order with sellerOrderId ${order.orderId} already exists. Skipping...`
              // );
              skippedOrders.push({
                orderId: order.orderId,
                reason: 'Duplicate sellerOrderId',
              });
              return;
            }

            for (const product of order.products) {
              const sku = product.sku?.toString();
              const quantity = product.quantity || 0;

              if (!sku) {
                console.warn(`Invalid SKU found in order ${order.orderId}`);
                continue;
              }

              try {
                const storeProduct = await productModel.findOne({ sku });

                if (storeProduct) {
                  simplifiedProducts.push({
                    quantity,
                    productName: storeProduct.productName || '',
                    productSKU: storeProduct.sku || '',
                    PurchasePrice: storeProduct.cost_of_price || '0',
                    sellPrice: storeProduct.price?.amount?.toString() || '0',
                  });

                  //Decrease available stock
                  storeProduct.available =
                    (storeProduct.available || 0) - quantity;

                  await storeProduct.save();
                } else {
                  console.warn(
                    `Product with SKU ${sku} not found in order ${order.orderId}`
                  );
                }
              } catch (productErr) {
                console.error(
                  `Database error for SKU ${sku} in order ${order.orderId}:`,
                  productErr
                );
              }
            }

            if (simplifiedProducts.length === 0) {
              console.warn(
                `No valid products to save for order ${order.orderId}`
              );
              failedOrders.push({
                orderId: order.orderId,
                reason: 'No valid products',
              });
              return;
            }

            await orderModel.create({
              sellerOrderId: order.orderId,
              status: order.status,
              orderDate: new Date(order.orderDate),
              customerName: order.customer,
              customerAddress: order.location,
              products: simplifiedProducts,
            });
          } catch (orderErr) {
            console.error(`Error processing order ${order.orderId}:`, orderErr);
            failedOrders.push({
              orderId: order.orderId,
              reason: orderErr.message || 'Unknown error',
            });
          }
        })
      );

      res.status(200).json({
        message: 'Orders processed successfully',
        success: true,
        processedCount: transformedData.length,
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
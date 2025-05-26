import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import syncOrdersFromAPI from '../service/syncOrderFromAPI.service';

// Transformation function
// function transformOrdersData(orders: any[]) {
//   return orders.map((order) => {
//     // Extract buyer info
//     const buyerName = order.buyerInfo?.primaryContact?.name;
//     const buyerAddress = order.orderLines[0]?.shipToAddress?.address;

//     // Transform order lines
//     const transformedOrderLines = order.orderLines.map((line: any) => ({
//       lineId: line.lineId,
//       productName: line.orderProduct?.productName || 'Unknown Product',
//       sku: line.orderProduct?.sku || 'Unknown SKU',
//       fulfillmentType: line.fulfillmentType || 'UNKNOWN',
//       quantity: line.orderedQty?.measurementValue || 1,
//     }));

//     // Build the transformed order object
//     return {
//       sellerOrderId: order.sellerOrderId,
//       orderType: order.orderType,
//       status: order.status,
//       orderDate: order.orderDate,
//       buyerInfo: {
//         name: buyerName
//           ? `${buyerName.firstName} ${buyerName.lastName}`
//           : 'Unknown Buyer',
//         address: {
//           addressLine1: buyerAddress?.addressLineOne || '',
//           addressLine2: buyerAddress?.addressLineTwo || '',
//           city: buyerAddress?.city || '',
//           state: buyerAddress?.stateOrProvinceCode || '',
//           country: buyerAddress?.countryCode || 'US',
//           postalCode: buyerAddress?.postalCode || '',
//         },
//       },
//       orderLines: transformedOrderLines,
//       shipments: order.shipments?.map((shipment: any) => ({
//         trackingNo: shipment.trackingNo,
//         carrier: shipment.carrierDescription,
//         status: shipment.status,
//         estimatedDelivery: shipment.shipmentDates?.find(
//           (d: any) => d.dateTypeId === 'DELIVERY'
//         )?.expectedDate,
//       })),
//     };
//   });
// }

function transformOrdersData(orders: any[]) {
  return orders.map((order) => {
    const buyerName = order.buyerInfo?.primaryContact?.name;
    const address = order.orderLines[0]?.shipToAddress?.address;
    const primaryShipment = order.shipments?.[0];
    const firstProduct = order.orderLines?.[0]?.orderProduct;

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

      // Transform the Walmart API data to our desired format
      const transformedData = transformOrdersData(result as any[]);

      res.status(200).json({
        data: result,
        success: true,
        count: transformedData.length,
      });
    } catch (error) {
      console.error('Error fetching orders:', error);
      next(error);
    }
  }
);

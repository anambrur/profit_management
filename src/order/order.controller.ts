import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import syncOrdersFromAPI from '../service/syncOrderFromAPI.service';

// Transformation function
function transformOrdersData(orders: any[]) {
  return orders.map((order) => {
    // Extract buyer info
    const buyerName = order.buyerInfo?.primaryContact?.name;
    const buyerAddress = order.orderLines[0]?.shipToAddress?.address;

    // Transform order lines
    const transformedOrderLines = order.orderLines.map((line: any) => ({
      lineId: line.lineId,
      productName: line.orderProduct?.productName || 'Unknown Product',
      sku: line.orderProduct?.sku || 'Unknown SKU',
      fulfillmentType: line.fulfillmentType || 'UNKNOWN',
      quantity: line.orderedQty?.measurementValue || 1,
    }));

    // Build the transformed order object
    return {
      sellerOrderId: order.sellerOrderId,
      orderType: order.orderType,
      status: order.status,
      orderDate: order.orderDate,
      buyerInfo: {
        name: buyerName
          ? `${buyerName.firstName} ${buyerName.lastName}`
          : 'Unknown Buyer',
        address: {
          addressLine1: buyerAddress?.addressLineOne || '',
          addressLine2: buyerAddress?.addressLineTwo || '',
          city: buyerAddress?.city || '',
          state: buyerAddress?.stateOrProvinceCode || '',
          country: buyerAddress?.countryCode || 'US',
          postalCode: buyerAddress?.postalCode || '',
        },
      },
      orderLines: transformedOrderLines,
      shipments: order.shipments?.map((shipment: any) => ({
        trackingNo: shipment.trackingNo,
        carrier: shipment.carrierDescription,
        status: shipment.status,
        estimatedDelivery: shipment.shipmentDates?.find(
          (d: any) => d.dateTypeId === 'DELIVERY'
        )?.expectedDate,
      })),
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
        data: transformedData,
        success: true,
        count: transformedData.length,
      });
    } catch (error) {
      console.error('Error fetching orders:', error);
      next(error);
    }
  }
);



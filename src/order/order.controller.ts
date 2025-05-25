import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import syncOrdersFromAPI from '../service/syncOrderFromAPI.service';

export const getAllOrders = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = req.params.id;

    if (!id) {
      res
        .status(400)
        .json({ message: 'Missing order ID parameter', success: false });
      return;
    }

    try {
      const result = await syncOrdersFromAPI(id);

      // console.log(result);
      // if (!result || result.length === 0) {
      //   res.status(200).json({ message: 'No orders found', success: true });
      //   return;
      // }

      // const resultWithStatus = result.map((order: Order) => ({
      //   sellerOrderId: order.sellerOrderId,
      //   status: order.status,
      //   orderDate: order.orderDate,
      //   fulfillmentType: order.orderLines[0]?.fulfillmentType,
      //   quantity:
      //     order.orderLines[0]?.orderLineQuantityInfo?.[0]?.statusQuantity
      //       ?.measurementValue,
      //   productName: order.orderLines[0]?.orderProduct?.productName,
      //   productSKU: order.orderLines[0]?.orderProduct?.sku,
      // }));

      // if (resultWithStatus.length === 0) {
      //   res.status(200).json({ message: 'No orders found', success: true });
      //   return;
      // }

      // console.log(resultWithStatus.length);
      // for (let index = 0; index < resultWithStatus.length; index++) {
      //   const product = resultWithStatus[index];
      //   console.log(product.productSKU);
      //   // const singleProduct = productModel.findOne({ sku: product.productSKU });
      //   // console.log(singleProduct);
      // }

      res.status(200).json({ result, success: true });
    } catch (error) {
      next(error);
    }
  }
);

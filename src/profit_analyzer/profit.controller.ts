/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import orderModel from '../order/order.model';

export const getProfit = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const { storeId, startDate, endDate } = req.query;

      // Get data for all predefined periods in parallel
      const [today, yesterday, thisMonth, lastMonth] = await Promise.all([
        getPeriodData('today', now, storeId?.toString()),
        getPeriodData('yesterday', now, storeId?.toString()),
        getPeriodData('thisMonth', now, storeId?.toString()),
        getPeriodData('lastMonth', now, storeId?.toString()),
      ]);

      // Prepare the base response with predefined periods
      const responseData: any = {
        today,
        yesterday,
        thisMonth,
        lastMonth,
      };

      // Add custom date range data if provided
      if (startDate && endDate) {
        const customStart = new Date(startDate as string);
        const customEnd = new Date(endDate as string);
        customEnd.setHours(23, 59, 59, 999);

        responseData.custom = await getSalesData(
          customStart,
          customEnd,
          storeId?.toString()
        );
        responseData.customPeriod = {
          start: customStart,
          end: customEnd,
        };
      }

      res.json({
        success: true,
        data: responseData,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: 'Server Error',
      });
    }
  }
);

// Helper function to get data for a specific period
async function getPeriodData(period: string, now: Date, storeId?: string) {
  let startDate, endDate;

  switch (period) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      endDate = new Date(now.setHours(23, 59, 59, 999));
      break;
    case 'yesterday':
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = new Date(yesterday.setHours(0, 0, 0, 0));
      endDate = new Date(yesterday.setHours(23, 59, 59, 999));
      break;
    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
      break;
    case 'lastMonth':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    default:
      throw new Error('Invalid period');
  }

  return await getSalesData(startDate, endDate, storeId);
}

// Sales data calculation (same as before)
async function getSalesData(startDate: Date, endDate: Date, storeId?: string) {
  // Create base query
  const query: any = {
    orderDate: { $gte: startDate, $lte: endDate },
  };

  // Add storeId filter if provided
  if (storeId) {
    query.storeId = storeId;
  }

  const orders = await orderModel.find(query);

  let totalSales = 0;
  let totalCost = 0;
  let totalFees = 0;
  let totalTaxes = 0;
  let totalShipping = 0;
  const orderCount = orders.length;
  let profitableOrders = 0;
  let unprofitableOrders = 0;

  // Calculate order profitability
  const orderAnalysis = orders.map((order) => {
    let orderSales = 0;
    let orderCost = 0;
    let orderFees = 0;

    order.products.forEach((product) => {
      const qty = product.quantity || 1;
      orderSales += parseFloat(product.sellPrice) * qty;
      orderCost += parseFloat(product.PurchasePrice) * qty;
      orderFees +=
        (parseFloat(product.tax) || 0) + (parseFloat(product.shipping) || 0);
    });

    const orderProfit = orderSales - orderCost - orderFees;
    const isProfitable = orderProfit > 0;

    if (isProfitable) profitableOrders++;
    else unprofitableOrders++;

    return {
      orderId: order.customerOrderId,
      profit: orderProfit.toFixed(2),
      margin: ((orderProfit / orderSales) * 100).toFixed(1),
    };
  });

  // Calculate totals
  orders.forEach((order: any) => {
    order.products.forEach((product: any) => {
      const qty = product.quantity || 1;
      totalSales += parseFloat(product.sellPrice) * qty;
      totalCost += parseFloat(product.PurchasePrice) * qty;
      totalFees +=
        (parseFloat(product.tax) || 0) + (parseFloat(product.shipping) || 0);
      totalTaxes += parseFloat(product.tax) || 0;
      totalShipping += parseFloat(product.shipping) || 0;
    });
  });

  const grossProfit = totalSales - totalCost - totalFees;
  const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    summary: {
      sales: totalSales.toFixed(2),
      orders: orderCount,
      cost: totalCost.toFixed(2),
      fees: totalFees.toFixed(2),
      taxes: totalTaxes.toFixed(2),
      shipping: totalShipping.toFixed(2),
      profit: grossProfit.toFixed(2),
      margin: profitMargin.toFixed(1),
    },
    orderAnalysis: {
      profitableOrders,
      unprofitableOrders,
      neutralOrders: orderCount - profitableOrders - unprofitableOrders,
      orders: orderAnalysis,
    },
  };
}

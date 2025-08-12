/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Response } from 'express';
import orderModel from '../order/order.model.js';
import storeModel from '../store/store.model.js';
import { checkStoreAccess } from '../utils/store-access.js';
import { StoreAccessRequest } from '../types/store-access';
import createHttpError from 'http-errors';

export const getProfit = async (
  req: StoreAccessRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = req.user!;
    const now = new Date();

    // Extract query parameters with type safety
    const storeId = req.query.storeId?.toString();
    const startDate = req.query.startDate?.toString();
    const endDate = req.query.endDate?.toString();
    const storeIds = req.query.storeIds?.toString();
    
    // Handle store access validation
    let storeIdArray: string[] | undefined;
    
    if (storeIds) {
      storeIdArray = storeIds.split(',').map(id => id.trim());
      const unauthorized = storeIdArray.some(id => !checkStoreAccess(user, id));
      if (unauthorized) {
        return next(createHttpError(403, 'No access to one or more stores'));
      }
    } else if (storeId) {
      storeIdArray = [storeId];
      if (!checkStoreAccess(user, storeId)) {
        return next(createHttpError(403, 'No access to this store'));
      }
    } else {
      // If no storeId provided, use all allowed stores
      const allowedStores = await storeModel
        .find({ _id: { $in: user.allowedStores } })
        .select('storeId -_id');
      storeIdArray = allowedStores.map(store => store.storeId);
    }

    // Parallel fetching of fixed period data
    const [today, yesterday, thisMonth, lastMonth, last6Months] =
      await Promise.all([
        getPeriodData('today', now, storeIdArray),
        getPeriodData('yesterday', now, storeIdArray),
        getPeriodData('thisMonth', now, storeIdArray),
        getPeriodData('lastMonth', now, storeIdArray),
        getPeriodData('last6Months', now, storeIdArray),
      ]);

    const responseData: any = {
      today,
      yesterday,
      thisMonth,
      lastMonth,
      last6Months,
    };

    // Handle custom date range
    if (startDate && endDate) {
      const customStart = new Date(startDate);
      const customEnd = new Date(endDate);
      customEnd.setHours(23, 59, 59, 999);

      // Optional: Validate the dates
      if (isNaN(customStart.getTime()) || isNaN(customEnd.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid startDate or endDate',
        });
      }

      const customData = await getSalesData(
        customStart,
        customEnd,
        storeIdArray
      );
      responseData.custom = customData;
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
    console.error('Error in getProfit:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error',
    });
  }
};

// Helper function to get data for a specific period
async function getPeriodData(period: string, now: Date, storeIds?: string[]) {
  let startDate, endDate;

  switch (period) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      endDate = new Date(now.setHours(23, 59, 59, 999));
      break;
    case 'yesterday':
      { const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = new Date(yesterday.setHours(0, 0, 0, 0));
      endDate = new Date(yesterday.setHours(23, 59, 59, 999));
      break; }
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
    case 'last6Months':
      startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
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
    default:
      throw new Error('Invalid period');
  }

  return await getSalesData(startDate, endDate, storeIds);
}

// Sales data calculation (same as before)
async function getSalesData(
  startDate: Date,
  endDate: Date,
  storeIds?: string[]
) {
  // Create base query
  const query: any = {
    orderDate: { $gte: startDate, $lte: endDate },
  };

  // Add storeId filter if provided
  if (storeIds && storeIds.length > 0) {
    query.storeId = { $in: storeIds };
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
      orderSales += parseFloat(product.sellPrice as string) * qty;
      orderCost += parseFloat(product.PurchasePrice as string) * qty;
      orderFees +=
        (parseFloat(product.tax as string) || 0) +
        (parseFloat(product.shipping as string) || 0);
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
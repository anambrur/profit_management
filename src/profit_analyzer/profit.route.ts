/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import { getProfit } from './profit.controller.js';

import { hasPermission } from '../middlewares/checkPermission.js';

const profitRouter = Router();

function asyncHandler(fn: any) {
  return function (req: any, res: any, next: any): void {
    Promise.resolve(fn(req, res, next))
      .then(() => {})
      .catch(next);
  };
}
profitRouter.get(
  '/get-all-profits',
  authenticateUser,
  hasPermission('profit-analyzer:view'),
  asyncHandler(getProfit)
);

export default profitRouter;

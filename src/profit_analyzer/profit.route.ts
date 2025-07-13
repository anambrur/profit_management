import { Router } from 'express';
import authenticateUser from '../middlewares/authenticateUser.js';
import { getProfit } from './profit.controller.js';

const profitRouter = Router();

function asyncHandler(fn: any) {
  return function (req: any, res: any, next: any): void {
    Promise.resolve(fn(req, res, next))
      .then(() => {})
      .catch(next);
  };
}
profitRouter
  .route('/get-all-profits')
  // @ts-ignore
  .get(authenticateUser, asyncHandler(getProfit));

export default profitRouter;

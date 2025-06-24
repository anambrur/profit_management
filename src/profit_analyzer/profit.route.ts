import { Router } from 'express';
import { getProfit } from './profit.controller.js';

const profitRouter = Router();

function asyncHandler(fn: any) {
	return function (req: any, res: any, next: any) {
		Promise.resolve(fn(req, res, next)).catch(next);
	};
}

profitRouter.route('/get-all-profits').get(asyncHandler(getProfit));

export default profitRouter;

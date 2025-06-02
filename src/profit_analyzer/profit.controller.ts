import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
// import profitModel from './profit.model';

export const getProfit = expressAsyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const profit = await profitModel.find();
            res.status(200).json({ profit, success: true });
        } catch (error) {
            next(error);
        }
    }
);
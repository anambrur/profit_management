import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import syncOrdersFromAPI from '../service/syncOrderFromAPI.service.js';

export const createFulfillment = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const result = await syncOrdersFromAPI(id);
      res.status(200).json({ result, success: true });
    } catch (error) {
      next(error);
    }
  }
);

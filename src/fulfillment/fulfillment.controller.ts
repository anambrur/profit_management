import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import syncOrdersFromAPI from '../service/syncFulfillmentFromAPI.service.js';

export const createFulfillment = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const result = await syncOrdersFromAPI(id);
    } catch (error) {
      next(error);
    }
  }
);

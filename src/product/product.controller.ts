import { NextFunction, Request, Response } from 'express';
import expressAsyncHandler from 'express-async-handler';
import syncItemsFromAPI from '../service/syncItemsFromAPI.service';

export const getAllProducts = expressAsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params.id;
    try {
      const data = await syncItemsFromAPI(id);
      res.status(200).json({ data, success: true });
    } catch (error) {
      next(error);
    }
  }
);

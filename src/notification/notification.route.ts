import { Request, Response, Router } from 'express';
import Notification from './notification.model';

const notificationRouter = Router();

notificationRouter.get(
  '/get-notification',
  async (req: Request, res: Response) => {
    try {
      const notification = await Notification.find({});
      res.status(200).json(notification);
    } catch (err) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

export default notificationRouter;

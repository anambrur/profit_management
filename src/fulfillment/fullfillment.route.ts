import { Router } from 'express';
import { createFulfillment } from './fulfillment.controller';

const fulfillmentRouter = Router();

fulfillmentRouter.get('/sync-fulfillment/:id', createFulfillment);

export default fulfillmentRouter;

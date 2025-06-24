import { Router } from 'express';
import { createFulfillment } from './fulfillment.controller.js';

const fulfillmentRouter = Router();

fulfillmentRouter.get('/sync-fulfillment/:id', createFulfillment);

export default fulfillmentRouter;

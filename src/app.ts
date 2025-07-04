import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application } from 'express';
import ExpressMongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import envConfig from './config/envConfig.js';
import fulfillmentRouter from './fulfillment/fullfillment.route.js';
import globalError from './middlewares/globalError.js';
import orderRouter from './order/order.route.js';
import productRouter from './product/product.routes.js';
import productHistoryRouter from './productHistory/productHistory.route.js';
import profitRouter from './profit_analyzer/profit.route.js';
import storeRouter from './store/store.route.js';
import userRouter from './user/user.routes.js';

const app: Application = express();

if (envConfig.nodeEnv !== 'development') {
  app.use(helmet());
  app.use(
    cors({
      origin: ['http://localhost:3000', process.env.FRONTEND_URL!],
      credentials: true,
    })
  );
  app.use(morgan('combined'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(compression());
  app.use(ExpressMongoSanitize());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
    })
  );
} else {
  app.use(
    cors({
      origin: ['http://localhost:3000', process.env.FRONTEND_URL!],
      credentials: true,
    })
  );
  app.use(morgan('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
}

app.use('/api/users', userRouter);
app.use('/api/profits', profitRouter);
app.use('/api/stores', storeRouter);
app.use('/api/products', productRouter);
app.use('/api/orders', orderRouter);
app.use('/api/fulfillments', fulfillmentRouter);
app.use('/api/product-history', productHistoryRouter);

// Global Error Handler
app.use(globalError);
export default app;

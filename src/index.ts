import http from 'http';
import app from './app.js';
import envConfig from './config/envConfig.js';
import connectDB from './db/dbConnection.js';
import { OrderCornJob, ProductCornJob } from './service/cornJob.service.js';
import { initNotificationService } from './service/notification.service.js';
import seed from './scripts/seed.js';

const server = http.createServer(app);

const startServer = async () => {
  await connectDB();
  server.listen(envConfig.port, () => {
    console.log(`Server is running on http://localhost:${envConfig.port}`);
  });
  seed();
  initNotificationService(server);
  ProductCornJob();
  OrderCornJob();
};

startServer();

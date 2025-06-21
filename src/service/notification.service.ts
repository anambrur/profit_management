// services/notification.service.ts
import { Server } from 'socket.io';

let io: Server;

export const initNotificationService = (httpServer: any) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      methods: ['GET', 'POST'],
    },
  });

  return io;
};

export const sendNotification = (
  type: 'success' | 'error' | 'info',
  message: string
) => {
  if (io) {
    io.emit('cron-notification', {
      type,
      message,
      timestamp: new Date().toISOString(),
    });
  }
};

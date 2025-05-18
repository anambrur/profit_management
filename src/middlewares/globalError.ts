import { HttpError } from 'http-errors';

const globalError = (err: HttpError, req: any, res: any, next: any) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : null,
    success: false,
    status: err.statusCode,
  });
};

export default globalError;

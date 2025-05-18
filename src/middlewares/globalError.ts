import { NextFunction, Request, Response } from 'express';
import { HttpError } from 'http-errors';

const globalError = (
  err: HttpError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : null,
    success: false,
    status: statusCode,
  });
};

export default globalError;

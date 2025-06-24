import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import envConfig from '../config/envConfig.js';

interface UserPayload {
  id: string;
  iat: number;
  exp: number;
}

const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token found' });
  }

  try {
    const decoded = jwt.verify(
      token,
      envConfig.jwtSecret as string
    ) as UserPayload;
    req.user = { id: decoded.id };
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ message: 'Unauthorized: Token expired or invalid' });
  }
};

export default authenticateUser;

import { NextFunction, Request, Response } from 'express';
import userModel from '../user/user.model.js';

const protectAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Unauthorized: Login required' });
  }

  try {
    const user = await userModel.findById(req.user.id);

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admin access only' });
    }

    next();
  } catch (error) {
    console.error('protectAdmin error:', error);
    res
      .status(500)
      .json({ message: 'Server error while checking admin access' });
  }
};

export default protectAdmin;

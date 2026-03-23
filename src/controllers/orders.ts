import { Response, NextFunction } from 'express';
import { createOrderSchema, updateOrderSchema, searchOrderSchema } from '../models/orders';
import { orderService } from '../services/orders';
import { UserRole, type AuthRequest, type ApiResponse } from '../types/index';

// ─── Order Controller ─────────────────────────────────────────────────────────

export const getAllOrders = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = searchOrderSchema.parse(req.query);

    if (req.user?.role !== UserRole.ADMIN) {
      filters.userId = req.user?.userId;
    }

    const { rows, meta } = await orderService.search(filters);

    const response: ApiResponse = {
      success: true,
      data: rows,
      meta,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

export const getOrderById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const order = await orderService.getById(req.params['id'] as string);

    if (req.user?.role !== UserRole.ADMIN && order.userId !== req.user?.userId) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const response: ApiResponse = {
      success: true,
      data: order,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

export const createOrder = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createOrderSchema.parse(req.body);
    const userId = req.user?.userId as string;
    const order = await orderService.create(userId, validatedData);

    const response: ApiResponse = {
      success: true,
      data: order,
      message: 'Order created successfully',
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
};

export const updateOrderStatus = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = updateOrderSchema.parse(req.body);
    const order = await orderService.updateStatus(req.params['id'] as string, validatedData);

    const response: ApiResponse = {
      success: true,
      data: order,
      message: 'Order updated successfully',
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

export const deleteOrder = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orderId = req.params['id'] as string;

    if (req.user?.role === UserRole.ADMIN) {
      await orderService.remove(orderId);
    } else {
      await orderService.cancel(orderId);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Order deleted successfully',
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

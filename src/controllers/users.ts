import { Response, NextFunction } from 'express';
import { updateUserSchema, searchUserSchema, createUserSchema } from '../models/users';
import { userService } from '../services/users';
import type { AuthRequest, ApiResponse } from '../types/index';

// ─── User Controller ──────────────────────────────────────────────────────────

export const getAllUsers = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = searchUserSchema.parse(req.query);
    const { rows, meta } = await userService.search(filters);

    const response: ApiResponse = {
      success: true,
      data: rows.map((u) => u.toSafeJSON()),
      meta,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

export const getUserById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await userService.getById(req.params['id'] as string);

    const response: ApiResponse = {
      success: true,
      data: user.toSafeJSON(),
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

export const createUser = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createUserSchema.parse(req.body);
    const user = await userService.adminCreate(validatedData);

    const response: ApiResponse = {
      success: true,
      data: user.toSafeJSON(),
      message: 'User created successfully',
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = updateUserSchema.parse(req.body);
    const user = await userService.adminUpdate(req.params['id'] as string, validatedData);

    const response: ApiResponse = {
      success: true,
      data: user.toSafeJSON(),
      message: 'User updated successfully',
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await userService.remove(req.params['id'] as string);

    const response: ApiResponse = {
      success: true,
      message: 'User deleted successfully',
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

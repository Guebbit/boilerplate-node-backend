import { Request, Response, NextFunction } from 'express';
import { createUserSchema } from '../models/users';
import { userService } from '../services/users';
import type { ApiResponse } from '../types/index';

// ─── Auth Controller ──────────────────────────────────────────────────────────

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const { token, user } = await userService.login(email, password);

    const response: ApiResponse = {
      success: true,
      data: { token, user: user.toSafeJSON() },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createUserSchema.parse(req.body);
    const user = await userService.register(validatedData);

    const response: ApiResponse = {
      success: true,
      data: user.toSafeJSON(),
      message: 'User registered successfully',
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
};

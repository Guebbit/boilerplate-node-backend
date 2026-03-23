import { userRepository } from '../repositories/users';
import type { FindAllUsersResult } from '../repositories/users';
import type { CreateUserInput, UpdateUserInput, SearchUserInput } from '../models/users';
import { User } from '../models/users';
import { env } from '../config/environment';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { TokenPayload } from '../types/index';

// ─── App Error ────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// ─── User Service ─────────────────────────────────────────────────────────────

export const userService = {
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const user = await userRepository.findByEmail(email);
    if (!user) throw new AppError('Invalid email or password', 401);

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) throw new AppError('Invalid email or password', 401);

    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const signOptions: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
    const token = jwt.sign(payload, env.JWT_SECRET, signOptions);

    return { token, user };
  },

  async register(data: CreateUserInput): Promise<User> {
    const existing = await userRepository.findByEmail(data.email);
    if (existing) throw new AppError('Email already in use', 409);
    return userRepository.create(data);
  },

  async getById(id: string): Promise<User> {
    const user = await userRepository.findById(id);
    if (!user) throw new AppError('User not found', 404);
    return user;
  },

  async search(filters: SearchUserInput): Promise<FindAllUsersResult> {
    return userRepository.findAll(filters);
  },

  async adminCreate(data: CreateUserInput): Promise<User> {
    const existing = await userRepository.findByEmail(data.email);
    if (existing) throw new AppError('Email already in use', 409);
    return userRepository.create(data);
  },

  async adminUpdate(id: string, data: UpdateUserInput): Promise<User> {
    if (data.email) {
      const existing = await userRepository.findByEmail(data.email);
      if (existing && existing.id !== id) throw new AppError('Email already in use', 409);
    }
    const user = await userRepository.update(id, data);
    if (!user) throw new AppError('User not found', 404);
    return user;
  },

  async remove(id: string): Promise<void> {
    const deleted = await userRepository.remove(id);
    if (!deleted) throw new AppError('User not found', 404);
  },
};

import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

// ─── JWT / Auth Types ─────────────────────────────────────────────────────────

/** Payload stored inside the JWT token */
export interface TokenPayload extends JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

/** Request extended with authenticated user info */
export interface AuthRequest extends Request {
  user?: TokenPayload;
}

// ─── Enum Types ───────────────────────────────────────────────────────────────

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

// ─── Generic API Response ─────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

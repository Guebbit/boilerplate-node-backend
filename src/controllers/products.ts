import { Request, Response, NextFunction } from 'express';
import { createProductSchema, updateProductSchema, searchProductSchema } from '../models/products';
import { productService } from '../services/products';
import type { AuthRequest, ApiResponse } from '../types/index';

// ─── Product Controller ───────────────────────────────────────────────────────

export const getAllProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filters = searchProductSchema.parse(req.query);
    const { rows, meta } = await productService.search(filters);

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

export const getProductById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.getById(req.params['id'] as string);

    const response: ApiResponse = {
      success: true,
      data: product,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

export const createProduct = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createProductSchema.parse(req.body);
    const product = await productService.create(validatedData);

    const response: ApiResponse = {
      success: true,
      data: product,
      message: 'Product created successfully',
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
};

export const updateProduct = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = updateProductSchema.parse(req.body);
    const product = await productService.update(req.params['id'] as string, validatedData);

    const response: ApiResponse = {
      success: true,
      data: product,
      message: 'Product updated successfully',
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

export const deleteProduct = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await productService.remove(req.params['id'] as string);

    const response: ApiResponse = {
      success: true,
      message: 'Product deleted successfully',
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
};

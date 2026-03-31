import type { Request, Response } from 'express';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * DELETE /products/:id
 * Delete a product by path id (admin).
 * Pass ?hardDelete=true to permanently delete; otherwise soft-deletes.
 */
const deleteProductById = async (request: Request, response: Response): Promise<void> => {
    // true = hard-delete; false (default) = soft-delete (sets deletedAt)
    const hardDelete = request.query.hardDelete === 'true';
    const result = await ProductService.remove(String(request.params.id), hardDelete);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, undefined, 200, result.message);
};

export default deleteProductById;

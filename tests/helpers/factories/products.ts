/**
 * Product factory
 *
 * Provides:
 *
 *   makeProduct(overrides?)   – plain-object payload, no DB write.
 *   createProduct(overrides?) – persists a product and returns the document.
 *
 * Usage example
 * -------------
 *   import { createProduct } from '../helpers/factories/products';
 *
 *   const product = await createProduct({ title: 'Gadget', price: 49.99 });
 */

import type { IProductDocument } from '@models/products';
import ProductRepository from '@repositories/products';

/**
 * Build a valid product payload.
 *
 * The defaults satisfy every required field so that a test can call
 * `createProduct()` with no arguments and get a usable document.
 *
 * @param overrides - Fields to override the factory defaults.
 */
export const makeProduct = (overrides: Partial<IProductDocument> = {}): Partial<IProductDocument> => ({
    title: 'Test Product',
    price: 9.99,
    description: 'A description for the test product.',
    imageUrl: 'https://example.com/product.jpg',
    active: true,
    ...overrides,
});

/**
 * Insert a product into the test database and return the Mongoose document.
 *
 * @param overrides - Fields to override the factory defaults.
 */
export const createProduct = (overrides: Partial<IProductDocument> = {}): Promise<IProductDocument> =>
    ProductRepository.create(makeProduct(overrides));

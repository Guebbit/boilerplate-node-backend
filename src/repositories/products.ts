import { productModel } from '@models/products';
import type { IProductDocument } from '@models/products';
import type { QueryFilter } from 'mongoose';
import { createBaseRepository, type IFindAllOptions } from './base';

/**
 * Product Repository
 * Standard CRUD via base factory + model-specific exports.
 */
const base = createBaseRepository<IProductDocument>(productModel);

export const findById = (id: string) => base.findById(id);
export const findOne = (where: QueryFilter<IProductDocument>) => base.findOne(where);
export const findAll = (where: QueryFilter<IProductDocument> = {}, options: IFindAllOptions = {}) => base.findAll(where, options);
export const count = (where: QueryFilter<IProductDocument> = {}): Promise<number> => base.count(where);
export const create = (data: Partial<IProductDocument>): Promise<IProductDocument> => base.create(data);
export const save = (product: IProductDocument): Promise<IProductDocument> => base.save(product);
export const deleteOne = (product: IProductDocument): Promise<void> => base.deleteOne(product);

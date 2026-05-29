import { orderModel } from '@models/orders';
import type { IOrderDocument } from '@models/orders';
import type { PipelineStage, QueryFilter } from 'mongoose';
import { createBaseRepository } from './base';

/**
 * Order Repository
 * Standard CRUD via base factory + order-specific aggregate.
 */
const base = createBaseRepository<IOrderDocument>(orderModel);

export const findById = (id: string) => base.findById(id);
export const findOne = (where: QueryFilter<IOrderDocument>) => base.findOne(where);
export const count = (where: QueryFilter<IOrderDocument> = {}): Promise<number> =>
    base.count(where);
export const create = (data: Partial<IOrderDocument>): Promise<IOrderDocument> => base.create(data);
export const save = (order: IOrderDocument): Promise<IOrderDocument> => base.save(order);
export const deleteOne = (order: IOrderDocument): Promise<void> => base.deleteOne(order);

/**
 * Run an aggregation pipeline against the Order collection.
 */
export const aggregate = <T = IOrderDocument>(pipeline: PipelineStage[]): Promise<T[]> =>
    orderModel.aggregate<T>(pipeline);

export const orderRepository = { aggregate, findById, findOne, count, create, save, deleteOne };

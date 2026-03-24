import orderModel from '@models/orders';
import type { IOrderDocument } from '@models/orders';
import type { PipelineStage, QueryFilter, QueryOptions } from 'mongoose';

/**
 * Order Repository
 * Handles all raw database operations for the Order entity.
 * No business logic here — only CRUD and aggregate operations against Mongoose.
 */

/**
 * Run an aggregation pipeline against the Order collection.
 * Returns typed results — use the generic parameter to override the default
 * when the pipeline changes the document shape (e.g. a $count stage).
 *
 * @param pipeline
 */
export const aggregate = <T = IOrderDocument>(pipeline: PipelineStage[]): Promise<T[]> =>
    orderModel.aggregate<T>(pipeline);

/**
 * Create a new order document
 *
 * @param data
 */
export const create = (data: Partial<IOrderDocument>): Promise<IOrderDocument> =>
    orderModel.create(data);

/**
 * Find a single order by its Mongoose _id.
 * Returns null when no document matches.
 *
 * @param id
 */
export const findById = (id: string): Promise<IOrderDocument | null> =>
    orderModel.findById(id);

/**
 * Find a single order matching the given filter.
 *
 * @param filter
 */
export const findOne = (filter: QueryFilter<IOrderDocument>): Promise<IOrderDocument | null> =>
    orderModel.findOne(filter);

/**
 * Find all orders matching the given filter with optional query options.
 *
 * @param filter
 * @param options
 */
export const findAll = (
    filter: QueryFilter<IOrderDocument> = {},
    options: QueryOptions<IOrderDocument> = {},
): Promise<IOrderDocument[]> =>
    orderModel.find(filter, null, options);

/**
 * Count orders matching the given filter.
 *
 * @param filter
 */
export const count = (filter: QueryFilter<IOrderDocument> = {}): Promise<number> =>
    orderModel.countDocuments(filter);

/**
 * Persist changes to an already-fetched order document.
 *
 * @param order
 */
export const save = (order: IOrderDocument): Promise<IOrderDocument> =>
    order.save();

/**
 * Hard-delete an order document from the collection.
 *
 * @param order
 */
export const deleteOne = (order: IOrderDocument): Promise<IOrderDocument> =>
    order.deleteOne();


export default { aggregate, create, findById, findOne, findAll, count, save, deleteOne };

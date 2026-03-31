import orderModel from '@models/orders';
import type { IOrderDocument } from '@models/orders';
import type { PipelineStage } from 'mongoose';

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

export default { aggregate, create };

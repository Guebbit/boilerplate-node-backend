import type { Model, Document, QueryFilter } from 'mongoose';

/**
 * Pagination/sort options shared across all repository findAll methods.
 */
export interface IFindAllOptions {
    sort?: Record<string, 1 | -1>;
    skip?: number;
    limit?: number;
}

/**
 * Creates the standard CRUD operations for a Mongoose model.
 * Reduces boilerplate across product/user/order/feedback repositories.
 */
export function createBaseRepository<TDocument extends Document>(mongooseModel: Model<TDocument>) {
    /** Fetch a single document by its MongoDB _id. */
    const findById = (id: string) => mongooseModel.findById(id);

    /** Fetch the first document matching the given filter. */
    const findOne = (where: QueryFilter<TDocument>) => mongooseModel.findOne(where);

    /** Fetch a filtered, sorted, paginated list as plain JS objects (lean). */
    const findAll = (
        where: QueryFilter<TDocument> = {},
        {
            sort = { createdAt: -1 as const },
            skip = 0,
            limit = 10
        }: IFindAllOptions = {}
    ) =>
        mongooseModel
            .find({ ...where })
            .lean()
            // eslint-disable-next-line unicorn/no-array-sort
            .sort(sort)
            .skip(skip)
            .limit(limit);

    /** Count how many documents match the given filter. */
    const count = (where: QueryFilter<TDocument> = {}): Promise<number> =>
        mongooseModel.countDocuments(where);

    /** Insert a new document into the collection. */
    const create = (data: Partial<TDocument>): Promise<TDocument> =>
        mongooseModel.create(data);

    /** Persist in-memory changes made to an already-fetched document. */
    const save = (document: TDocument): Promise<TDocument> => document.save();

    /** Remove a single document from the collection. */
    const deleteOne = (document: TDocument): Promise<void> =>
        document.deleteOne().then(() => {
            // explicit void return
        });

    return { findById, findOne, findAll, count, create, save, deleteOne };
}

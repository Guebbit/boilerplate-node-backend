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
    const findById = (id: string) => mongooseModel.findById(id);

    const findOne = (where: QueryFilter<TDocument>) => mongooseModel.findOne(where);

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

    const count = (where: QueryFilter<TDocument> = {}): Promise<number> =>
        mongooseModel.countDocuments(where);

    const create = (data: Partial<TDocument>): Promise<TDocument> =>
        mongooseModel.create(data);

    const save = (document: TDocument): Promise<TDocument> => document.save();

    const deleteOne = (document: TDocument): Promise<void> =>
        document.deleteOne().then(() => {
            // explicit void return
        });

    return { findById, findOne, findAll, count, create, save, deleteOne };
}

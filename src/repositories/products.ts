/* eslint-disable unicorn/no-null */
/* eslint-disable unicorn/no-negated-condition */
import { Op, type WhereOptions } from 'sequelize';
import { productModel } from '@models/products';
import type { IProductDocument } from '@models/products';

type ProductWhere = Record<string, unknown>;

/** Normalizes deletedAt filters to support null and explicit values. */
const normalizeDeletedAt = (where: ProductWhere, output: Record<string, unknown>) => {
    if (where.deletedAt === null) {
        output['deletedAt'] = null;
        return;
    }
    if (where.deletedAt !== undefined) output['deletedAt'] = where.deletedAt;
};

/** Converts product search filters to Sequelize where syntax. */
const toWhere = (where: ProductWhere = {}): WhereOptions => {
    const output: Record<string, unknown> = {};

    if (where.id !== undefined) output['id'] = Number(where.id);

    if (where.title !== undefined) output['title'] = where.title;
    if (where.active !== undefined) output['active'] = where.active;

    normalizeDeletedAt(where, output);

    const price = where.price as Record<string, unknown> | undefined;
    if (price && (price.min !== undefined || price.max !== undefined)) {
        output['price'] = {
            ...(price.min !== undefined ? { [Op.gte]: Number(price.min) } : {}),
            ...(price.max !== undefined ? { [Op.lte]: Number(price.max) } : {})
        };
    }

    const conditions = where.or as Array<Record<string, unknown>> | undefined;
    if (conditions && conditions.length > 0) {
        (output as Record<symbol, unknown>)[Op.or] = conditions
            .map((condition) => {
                if (condition.title && typeof condition.title === 'object') {
                    const contains = (condition.title as Record<string, unknown>).contains;
                    return { title: { [Op.like]: `%${String(contains)}%` } };
                }
                if (condition.description && typeof condition.description === 'object') {
                    const contains = (condition.description as Record<string, unknown>).contains;
                    return { description: { [Op.like]: `%${String(contains)}%` } };
                }
                return;
            })
            .filter(Boolean);
    }

    return output;
};

/** Finds one product by id. */
export const findById = (id: string | number) =>
    productModel.findByPk(Number(id)).then((product) => {
        if (product && product.deletedAt === null) product.deletedAt = undefined;
        return product;
    });

/** Finds the first product matching the given filter. */
export const findOne = (where: ProductWhere) =>
    productModel.findOne({ where: toWhere(where) }).then((product) => {
        if (product && product.deletedAt === null) product.deletedAt = undefined;
        return product;
    });

/** Lists products with pagination and sorting. */
export const findAll = (
    where: ProductWhere = {},
    {
        sort = { createdAt: -1 as const },
        skip = 0,
        limit = 10
    }: {
        sort?: Record<string, 1 | -1>;
        skip?: number;
        limit?: number;
    } = {}
) => {
    const [sortField, sortDirection] = Object.entries(sort)[0] ?? ['createdAt', -1];
    return productModel.findAll({
        where: toWhere(where),
        order: [[sortField, sortDirection === -1 ? 'DESC' : 'ASC']],
        offset: skip,
        limit,
        raw: true
    }) as Promise<IProductDocument[]>;
};

/** Counts products that match the filter. */
export const count = (where: ProductWhere = {}): Promise<number> =>
    productModel.count({ where: toWhere(where) });

/** Creates a new product row. */
export const create = (data: Partial<IProductDocument>): Promise<IProductDocument> =>
    productModel.create(data as never) as Promise<IProductDocument>;

/** Saves updates for an existing product. */
export const save = (product: IProductDocument): Promise<IProductDocument> =>
    product.save();

/** Permanently deletes a product row. */
export const deleteOne = (product: IProductDocument): Promise<void> =>
    product.destroy().then(() => {});

export const productRepository = { findById, findOne, findAll, count, create, save, deleteOne };

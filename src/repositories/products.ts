/* eslint-disable unicorn/no-null */
/* eslint-disable unicorn/no-negated-condition */
import { Op, type WhereOptions } from 'sequelize';
import { productModel } from '@models/products';
import type { IProductDocument } from '@models/products';

type ProductWhere = Record<string, unknown>;

/**
 * Handles normalize deleted at.
 *
 * @param where
 * @param output
 */
const normalizeDeletedAt = (where: ProductWhere, output: Record<string, unknown>) => {
    if (where.deletedAt === null) {
        output['deletedAt'] = null;
        return;
    }
    if (where.deletedAt !== undefined) output['deletedAt'] = where.deletedAt;
};

/**
 * Handles to where.
 *
 * @param where
 */
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

/**
 * Handles find by id.
 *
 * @param id - Resource identifier.
 */
export const findById = (id: string | number) =>
    productModel.findByPk(Number(id)).then((product) => {
        if (product && product.deletedAt === null) product.deletedAt = undefined;
        return product;
    });

/**
 * Handles find one.
 *
 * @param where
 */
export const findOne = (where: ProductWhere) =>
    productModel.findOne({ where: toWhere(where) }).then((product) => {
        if (product && product.deletedAt === null) product.deletedAt = undefined;
        return product;
    });

/**
 * Handles find all.
 *
 * @param where
 * @param options
 */
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

/**
 * Handles count.
 *
 * @param where
 */
export const count = (where: ProductWhere = {}): Promise<number> =>
    productModel.count({ where: toWhere(where) });

/**
 * Handles create.
 *
 * @param data
 */
export const create = (data: Partial<IProductDocument>): Promise<IProductDocument> =>
    productModel.create(data as never) as Promise<IProductDocument>;

/**
 * Handles save.
 *
 * @param product
 */
export const save = (product: IProductDocument): Promise<IProductDocument> =>
    product.save();

/**
 * Handles delete one.
 *
 * @param product
 */
export const deleteOne = (product: IProductDocument): Promise<void> =>
    product.destroy().then(() => {});

export const productRepository = { findById, findOne, findAll, count, create, save, deleteOne };

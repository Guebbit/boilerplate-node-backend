import { Op, type WhereOptions } from 'sequelize';
import { productModel } from '@models/products';
import type { IProductDocument } from '@models/products';

type ProductWhere = Record<string, unknown>;

const toWhere = (where: ProductWhere = {}): WhereOptions => {
    const output: Record<string, unknown> = {};

    if (where._id !== undefined || where.id !== undefined)
        output['id'] = Number(where._id ?? where.id);

    if (where.title !== undefined) output['title'] = where.title;
    if (where.active !== undefined) output['active'] = where.active;

    if (where.deletedAt === undefined) output['deletedAt'] = null;
    else if (where.deletedAt !== null) output['deletedAt'] = where.deletedAt;

    const price = where.price as Record<string, unknown> | undefined;
    if (price && (price.$gte !== undefined || price.$lte !== undefined)) {
        output['price'] = {
            ...(price.$gte !== undefined ? { [Op.gte]: Number(price.$gte) } : {}),
            ...(price.$lte !== undefined ? { [Op.lte]: Number(price.$lte) } : {})
        };
    }

    const conditions = where.$or as Array<Record<string, unknown>> | undefined;
    if (conditions && conditions.length > 0) {
        output[Op.or] = conditions
            .map((condition) => {
                if (condition.title && typeof condition.title === 'object') {
                    const regex = (condition.title as Record<string, unknown>).$regex;
                    return { title: { [Op.like]: `%${String(regex)}%` } };
                }
                if (condition.description && typeof condition.description === 'object') {
                    const regex = (condition.description as Record<string, unknown>).$regex;
                    return { description: { [Op.like]: `%${String(regex)}%` } };
                }
                return undefined;
            })
            .filter(Boolean);
    }

    return output;
};

export const findById = (id: string | number) => productModel.findByPk(Number(id));

export const findOne = (where: ProductWhere) => productModel.findOne({ where: toWhere(where) });

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

export const count = (where: ProductWhere = {}): Promise<number> =>
    productModel.count({ where: toWhere(where) });

export const create = (data: Partial<IProductDocument>): Promise<IProductDocument> =>
    productModel.create(data as never) as unknown as Promise<IProductDocument>;

export const save = (product: IProductDocument): Promise<IProductDocument> =>
    (product as unknown as { save: () => Promise<IProductDocument> }).save();

export const deleteOne = (product: IProductDocument): Promise<void> =>
    (product as unknown as { destroy: () => Promise<void> }).destroy().then(() => {});

export const productRepository = { findById, findOne, findAll, count, create, save, deleteOne };

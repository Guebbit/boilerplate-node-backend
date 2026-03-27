import { t } from 'i18next';
import { Op } from 'sequelize';
import type { SearchProductsRequest, ProductsResponse, Product } from '@api/api';
import { generateReject, generateSuccess, type IResponseReject, type IResponseSuccess } from '@utils/response';
import { deleteFile } from '@utils/filesystem-helpers';
import UserService from '@services/users';
import { zodProductSchema } from '@models/products';
import type { IProduct } from '@models/products';
import type ProductModel from '@models/products';
import ProductRepository from '@repositories/products';

/**
 * Product Service
 * Handles all business logic for the Product entity.
 * Delegates raw database access to Product Repository.
 */

/**
 * Validate product data using the Zod schema.
 * Returns an array of UI-friendly error messages (empty array means valid).
 *
 * @param productData
 */
export const validateData = (productData: Omit<Product, 'id'>): string[] => {
    const parseResult = zodProductSchema.safeParse(productData);
    if (!parseResult.success)
        return parseResult.error.issues.map(({ message }) => message);
    return [];
};

/**
 * Search products (DTO-friendly) — matches POST /products/search in OpenAPI.
 *
 * Filters: id (product), text, minPrice, maxPrice
 * Pagination: page (1-based), pageSize
 *
 * @param filters
 * @param admin - Admin scope: shows inactive and soft-deleted products
 */
export const search = async (
    filters: SearchProductsRequest = {},
    admin = false,
): Promise<ProductsResponse> => {
    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (filters.id && String(filters.id).trim() !== '')
        where['id'] = Number(filters.id);

    if (filters.text && String(filters.text).trim() !== '') {
        const text = `%${String(filters.text).trim()}%`;
        where[Op.or as unknown as string] = [
            { title: { [Op.like]: text } },
            { description: { [Op.like]: text } },
        ];
    }

    const priceConditions: Record<symbol, number> = {};
    if (filters.minPrice !== undefined && filters.minPrice !== null && !Number.isNaN(Number(filters.minPrice)))
        priceConditions[Op.gte] = Number(filters.minPrice);
    if (filters.maxPrice !== undefined && filters.maxPrice !== null && !Number.isNaN(Number(filters.maxPrice)))
        priceConditions[Op.lte] = Number(filters.maxPrice);
    if (Object.getOwnPropertySymbols(priceConditions).length > 0)
        where["price"] = priceConditions as Record<string, unknown>;

    if (!admin) {
        where['active'] = true;
        where['deletedAt'] = undefined;
    }

    const totalItems = await ProductRepository.count(where);
    const items = await ProductRepository.findAll(where, { skip, limit: pageSize });

    return {
        // @ts-expect-error Sequelize returns id not _id; cast for API compatibility
        items,
        meta: {
            page,
            pageSize,
            totalItems,
            totalPages: Math.ceil(totalItems / pageSize),
        },
    };
};

/**
 * Get a single product by ID as a plain JS object.
 * Admin can see inactive or soft-deleted products; non-admin cannot.
 * Returns undefined if the id is falsy; null if no matching document is found.
 *
 * @param id
 * @param admin
 */
export const getById = async (id: string | number | undefined, admin = false): Promise<IProduct | null | undefined> => {
    if (!id) return;
    const product = admin
        ? await ProductRepository.findById(id)
        : await ProductRepository.findOne({ id: Number(id), active: true, deletedAt: undefined });
    if (!product) return null;
    return product.toJSON() as IProduct;
};

/**
 * Create a new product in the database.
 *
 * @param data
 */
export const create = (data: Omit<Product, 'id'>): Promise<ProductModel> =>
    ProductRepository.create(data);

/**
 * Update an existing product by ID.
 *
 * @param id
 * @param data
 * @param newImageUrl
 */
export const update = async (
    id: string | number,
    data: Partial<Omit<Product, 'id'>>,
    newImageUrl = '',
): Promise<ProductModel> => {
    const product = await ProductRepository.findById(id);
    if (!product) throw new Error('404');

    if (data.title !== undefined) product.title = data.title;
    if (data.price !== undefined) product.price = data.price;
    if (data.description !== undefined) product.description = data.description;
    if (data.active !== undefined) product.active = data.active;

    const oldImageUrl = product.imageUrl;
    if (newImageUrl && oldImageUrl !== newImageUrl)
        product.imageUrl = newImageUrl;

    const updatedProduct = await ProductRepository.save(product);

    if (newImageUrl && oldImageUrl !== newImageUrl)
        await deleteFile((process.env.NODE_PUBLIC_PATH ?? 'public') + oldImageUrl);

    return updatedProduct;
};

/**
 * Remove a product by ID (soft or hard delete).
 *
 * @param id
 * @param hardDelete
 */
export const remove = async (
    id: string | number,
    hardDelete = false,
): Promise<IResponseSuccess<ProductModel> | IResponseSuccess<undefined> | IResponseReject> => {
    const product = await ProductRepository.findById(id);

    if (!product)
        return generateReject(404, '404', [t('ecommerce.product-not-found')]);

    if (hardDelete)
        return UserService.productRemoveFromCartsById(String(product.id))
            .then(() => ProductRepository.deleteOne(product))
            .then(() => deleteFile((process.env.NODE_PUBLIC_PATH ?? 'public') + product.imageUrl))
            .then(() => generateSuccess(undefined, 200, t('ecommerce.product-hard-deleted')));

    product.deletedAt = product.deletedAt ? undefined : new Date();

    return UserService.productRemoveFromCartsById(String(product.id))
        .then(async () => generateSuccess(await ProductRepository.save(product), 200, t('ecommerce.product-soft-deleted')));
};


export default { validateData, search, getById, create, update, remove };

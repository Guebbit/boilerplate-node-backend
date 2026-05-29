import { Types } from 'mongoose';
import type { Product, CartItem } from '@api/index';
import type { ICartItem, IUserDocument } from '@models/users';

/*
 * ICartItemDto: CartItem extended with an optional populated product.
 * Uses API-generated CartItem as the base to stay aligned with the OpenAPI contract.
 */
export type ICartItemDto = CartItem & { product?: Partial<Product> };

/*
 * IUserCartDto: internal user+cart projection returned by cart service operations.
 * No direct OpenAPI equivalent — includes the cart's updatedAt timestamp.
 */
export interface IUserCartDto {
    id: string;
    cart: {
        items: ICartItemDto[];
        updatedAt?: Date;
    };
}

/*
 * Normalize any Mongoose/plain-object ID representation to a plain string.
 * Handles ObjectId instances, string ids, {id}, and {_id} shapes recursively.
 */
export const toIdString = (value: unknown): string => {
    if (value instanceof Types.ObjectId) return value.toString();
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value && 'id' in value && typeof value.id === 'string')
        return value.id;
    if (typeof value === 'object' && value && '_id' in value) return toIdString(value._id);
    return '';
};

/*
 * Map an unknown (possibly populated) product value to a Partial<Product> DTO.
 * Returns undefined when the value is a bare ObjectId or string reference (not populated).
 * Dates are serialized as ISO strings to match the API contract.
 */
const toCartProductDto = (value: unknown): Partial<Product> | undefined => {
    if (value instanceof Types.ObjectId || typeof value === 'string') return undefined;
    if (!value || typeof value !== 'object') return undefined;
    const id = toIdString(value);
    if (!id) return undefined;

    const product = value as Record<string, unknown>;
    return {
        id,
        title: typeof product.title === 'string' ? product.title : undefined,
        price: typeof product.price === 'number' ? product.price : undefined,
        description: typeof product.description === 'string' ? product.description : undefined,
        imageUrl: typeof product.imageUrl === 'string' ? product.imageUrl : undefined,
        categories: Array.isArray(product.categories)
            ? product.categories.filter((category): category is string => typeof category === 'string')
            : undefined,
        tags: Array.isArray(product.tags)
            ? product.tags.filter((tag): tag is string => typeof tag === 'string')
            : undefined,
        active: typeof product.active === 'boolean' ? product.active : undefined,
        createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : undefined,
        updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : undefined,
        deletedAt: product.deletedAt instanceof Date ? product.deletedAt.toISOString() : undefined
    };
};

/*
 * Map a Mongoose cart item to ICartItemDto.
 * Resolves product to a DTO when populated; leaves it undefined for bare refs.
 */
export const toCartItemDto = ({ product, quantity }: ICartItem): ICartItemDto => ({
    productId: toIdString(product),
    quantity,
    product: toCartProductDto(product)
});

/*
 * Map a full user document to IUserCartDto, projecting only cart-relevant fields.
 */
export const toUserCartDto = (user: IUserDocument): IUserCartDto => ({
    id: user.id,
    cart: {
        items: user.cart.items.map((item) => toCartItemDto(item)),
        updatedAt: user.cart.updatedAt
    }
});

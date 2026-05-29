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
    if (typeof value === 'object' && value !== null) {
        const record = value as Record<string, unknown>;
        if (typeof record.id === 'string') return record.id;
        if (record._id) return toIdString(record._id);
    }
    return '';
};

/*
 * Map an unknown (possibly populated) product value to a Partial<Product> DTO.
 * Returns undefined when the value is a bare ObjectId or string reference (not populated).
 * Dates are serialized as ISO strings to match the API contract.
 */
const toCartProductDto = (value: unknown): Partial<Product> | undefined => {
    if (!value || typeof value !== 'object' || value instanceof Types.ObjectId) return undefined;

    const id = toIdString(value);
    if (!id) return undefined;

    const p = value as Record<string, unknown>;
    return {
        id,
        ...(typeof p.title === 'string' && { title: p.title }),
        ...(typeof p.price === 'number' && { price: p.price }),
        ...(typeof p.description === 'string' && { description: p.description }),
        ...(typeof p.imageUrl === 'string' && { imageUrl: p.imageUrl }),
        ...(Array.isArray(p.categories) && {
            categories: p.categories.filter((c): c is string => typeof c === 'string')
        }),
        ...(Array.isArray(p.tags) && {
            tags: p.tags.filter((t): t is string => typeof t === 'string')
        }),
        ...(typeof p.active === 'boolean' && { active: p.active }),
        ...(p.createdAt instanceof Date && { createdAt: p.createdAt.toISOString() }),
        ...(p.updatedAt instanceof Date && { updatedAt: p.updatedAt.toISOString() }),
        ...(p.deletedAt instanceof Date && { deletedAt: p.deletedAt.toISOString() })
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

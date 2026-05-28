import { Types } from 'mongoose';
import type { ICartItem, IUserDocument } from '@models/users';

export interface ICartProductDto {
    id: string;
    title?: string;
    price?: number;
    description?: string;
    imageUrl?: string;
    categories?: string[];
    tags?: string[];
    active?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
}

export interface ICartItemDto {
    productId: string;
    quantity: number;
    product?: ICartProductDto;
}

export interface IUserCartDto {
    id: string;
    cart: {
        items: ICartItemDto[];
        updatedAt?: Date;
    };
}

export const toCartIdString = (value: unknown): string => {
    if (value instanceof Types.ObjectId) return value.toString();
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value && 'id' in value && typeof value.id === 'string')
        return value.id;
    if (typeof value === 'object' && value && '_id' in value) return toCartIdString(value._id);
    return '';
};

const toCartProductDto = (value: unknown): ICartProductDto | undefined => {
    if (value instanceof Types.ObjectId || typeof value === 'string') return undefined;
    if (!value || typeof value !== 'object') return undefined;
    const id = toCartIdString(value);
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
        createdAt: product.createdAt instanceof Date ? product.createdAt : undefined,
        updatedAt: product.updatedAt instanceof Date ? product.updatedAt : undefined,
        deletedAt: product.deletedAt instanceof Date ? product.deletedAt : undefined
    };
};

export const toCartItemDto = ({ product, quantity }: ICartItem): ICartItemDto => ({
    productId: toCartIdString(product),
    quantity,
    product: toCartProductDto(product)
});

export const toUserCartDto = (user: IUserDocument): IUserCartDto => ({
    id: user.id,
    cart: {
        items: user.cart.items.map((item) => toCartItemDto(item)),
        updatedAt: user.cart.updatedAt
    }
});

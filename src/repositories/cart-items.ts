import { CartItemModel } from '@models/users';
import type { ICartItem } from '@models/users';
import type { WhereOptions } from 'sequelize';

/**
 * CartItem Repository
 * Handles all raw database operations for CartItem.
 */

export const findByUserId = (userId: number): Promise<CartItemModel[]> =>
    CartItemModel.findAll({ where: { userId } });

export const findOne = (where: WhereOptions<ICartItem>): Promise<CartItemModel | null> =>
    CartItemModel.findOne({ where });

export const create = (data: Partial<ICartItem>): Promise<CartItemModel> =>
    CartItemModel.create(data as ICartItem);

export const deleteByUserId = (userId: number): Promise<number> =>
    CartItemModel.destroy({ where: { userId } });

export const deleteByProductId = (productId: number): Promise<number> =>
    CartItemModel.destroy({ where: { productId } });

export const deleteOne = (item: CartItemModel): Promise<void> =>
    item.destroy().then(() => {});


export default { findByUserId, findOne, create, deleteByUserId, deleteByProductId, deleteOne };

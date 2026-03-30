import CartItemModel from '@models/cart-items';
import type { ICartItem } from '@models/cart-items';
import type { WhereOptions } from 'sequelize';

/**
 * CartItem Repository
 * Handles cart item persistence operations.
 */
export const findByUserId = (userId: number): Promise<CartItemModel[]> =>
    CartItemModel.findAll({ where: { userId } });

export const findOne = (where: WhereOptions<ICartItem>): Promise<CartItemModel | null> =>
    CartItemModel.findOne({ where });

export const create = (data: Partial<ICartItem>): Promise<CartItemModel> =>
    CartItemModel.create(data as ICartItem);

export const deleteByUserId = (userId: number): Promise<number> =>
    CartItemModel.destroy({ where: { userId } });

export const deleteOne = async (item: CartItemModel): Promise<void> => {
    await item.destroy();
};

export default { findByUserId, findOne, create, deleteByUserId, deleteOne };

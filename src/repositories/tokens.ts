import TokenModel from '@models/tokens';
import type { IToken } from '@models/tokens';
import type { WhereOptions } from 'sequelize';

/**
 * Token Repository
 * Handles token persistence operations.
 */
export const findByUserId = (userId: number): Promise<TokenModel[]> =>
    TokenModel.findAll({ where: { userId } });

export const findOne = (where: WhereOptions<IToken>): Promise<TokenModel | null> =>
    TokenModel.findOne({ where });

export const create = (data: Partial<IToken>): Promise<TokenModel> =>
    TokenModel.create(data as IToken);

export const deleteByUserId = (userId: number): Promise<number> =>
    TokenModel.destroy({ where: { userId } });

export const deleteOne = async (token: TokenModel): Promise<void> => {
    await token.destroy();
};

export default { findByUserId, findOne, create, deleteByUserId, deleteOne };

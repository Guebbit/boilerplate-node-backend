import { TokenModel } from '@models/users';
import type { IToken } from '@models/users';
import type { WhereOptions } from 'sequelize';

/**
 * Token Repository
 * Handles all raw database operations for Token.
 */

export const findByUserId = (userId: number): Promise<TokenModel[]> =>
    TokenModel.findAll({ where: { userId } });

export const findOne = (where: WhereOptions<IToken>): Promise<TokenModel | null> =>
    TokenModel.findOne({ where });

export const create = (data: Partial<IToken>): Promise<TokenModel> =>
    TokenModel.create(data as IToken);

export const deleteByUserId = (userId: number): Promise<number> =>
    TokenModel.destroy({ where: { userId } });

export const deleteOne = (token: TokenModel): Promise<void> =>
    token.destroy().then(() => {});


export default { findByUserId, findOne, create, deleteByUserId, deleteOne };

import { CreationOptional, DataTypes, Model, Op } from 'sequelize';
import { z } from 'zod';
import { t } from 'i18next';
import bcrypt from 'bcrypt';
import { logger } from '@utils/winston';
import { sequelize } from '@utils/database';
import { userTokenModel } from './user-tokens';

export enum ETokenType {
    REFRESH = 'refresh',
    PASSWORD_RESET = 'password'
}

export interface ICartItem {
    product:
        | number
        | {
              id?: number;
              price?: number;
              title?: string;
              description?: string;
              imageUrl?: string;
              active?: boolean;
          };
    quantity: number;
}

export interface IToken {
    token: string;
    type: string;
    expiration?: Date;
}

export interface IUser {
    id: number;
    email: string;
    username: string;
    password: string;
    imageUrl?: string;
    admin?: boolean;
    active?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date | null;
    cart: {
        items: ICartItem[];
        updatedAt: Date;
    };
    tokens: IToken[];
}

export class UserModel extends Model {
    declare id: CreationOptional<number>;
    declare email: string;
    declare username: string;
    declare password: string;
    declare imageUrl: string;
    declare admin: boolean;
    declare cartUpdatedAt: Date;
    declare deletedAt: Date | null;
    declare createdAt: Date;
    declare updatedAt: Date;

    /**
     * Populated only when `User.hasMany(CartItem, { as: 'cartItems' })` is included in the query.
     * Represents the normalized cart table rows linked to this user.
     */
    declare cartItems?: Array<{ productId: number; quantity: number; product?: unknown }>;
    /**
     * Populated only when `User.hasMany(UserToken, { as: 'tokens' })` is included in the query.
     * Represents token rows associated with this user.
     */
    declare tokens?: IToken[];

    /**
     * Handles to object.
     */
    toObject() {
        const plain = this.get({ plain: true }) as Record<string, unknown>;
        const cartItems =
            (plain['cartItems'] as Array<{ productId: number; quantity: number }> | undefined) ??
            this.cartItems ??
            [];
        const tokens = (plain['tokens'] as IToken[] | undefined) ?? this.tokens ?? [];

        return {
            ...plain,
            cart: {
                items: cartItems.map((item) => ({
                    product: item.productId,
                    quantity: item.quantity
                })),
                updatedAt: this.cartUpdatedAt
            },
            tokens
        };
    }

    /**
     * Handles token add.
     *
     * @param type
     * @param expirationMs
     * @param token
     */
    async tokenAdd(type: ETokenType, expirationMs: number, token: string): Promise<string> {
        await userTokenModel.create({
            userId: this.id,
            type,
            token,
            expiration: expirationMs > 0 ? new Date(Date.now() + expirationMs) : undefined
        } as never);
        return token;
    }

    /**
     * Handles token remove all.
     *
     * @param type
     */
    async tokenRemoveAll(type: ETokenType): Promise<void> {
        await userTokenModel.destroy({ where: { userId: this.id, type } });
    }

    /**
     * Handles populate.
     *
     * @param _path
     */
    async populate(_path: string) {
        return this;
    }

    /**
     * Handles update many.
     *
     * @param filter
     * @param update
     */
    static async updateMany(filter: Record<string, unknown>, update: Record<string, unknown>) {
        const where: Record<string, unknown> = {};
        if (filter.admin !== undefined) where.admin = filter.admin;
        if (filter.email !== undefined) where.email = filter.email;
        const [modifiedCount] = await this.update(update as never, { where });
        return { modifiedCount };
    }

    /**
     * Handles token remove expired.
     */
    static async tokenRemoveExpired(): Promise<{ status: number; success: boolean }> {
        const now = new Date();
        return userTokenModel
            .destroy({ where: { expiration: { [Op.lt]: now } } })
            .then(() => ({ status: 200, success: true }))
            .catch((error: Error) => {
                logger.error({
                    message: 'tokenRemoveExpired failed',
                    error
                });
                return { status: 500, success: false };
            });
    }
}

UserModel.init(
    {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                is: /^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[A-Za-z]{2,7}$/
            }
        },
        username: { type: DataTypes.STRING, allowNull: false },
        password: { type: DataTypes.STRING, allowNull: false },
        imageUrl: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'https://placekitten.com/600/600'
        },
        admin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        cartUpdatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        deletedAt: { type: DataTypes.DATE, allowNull: true }
    },
    {
        sequelize,
        modelName: 'User',
        tableName: 'users',
        timestamps: true,
        indexes: [
            { unique: true, fields: ['email'] },
            { fields: ['createdAt'] },
            { fields: ['deletedAt'] }
        ],
        hooks: {
            /**
             * Handles before save.
             *
             * @param user - User document used to scope the operation.
             */
            beforeSave: async (user) => {
                if (!user.changed('password')) return;
                user.password = await bcrypt.hash(user.password, 12);
            }
        }
    }
);

export interface IUserDocument extends IUserMethods {
    id: number;
    email: string;
    username: string;
    password: string;
    imageUrl: string;
    admin: boolean;
    deletedAt?: Date | null;
    cartUpdatedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    cart: {
        items: ICartItem[];
        updatedAt: Date;
    };
    tokens: IToken[];
    save: () => Promise<IUserDocument>;
    update: (values: Record<string, unknown>) => Promise<unknown>;
    destroy: () => Promise<void>;
    toObject: () => IUserDocument;
}

export type IUserListItem = Omit<IUserDocument, 'save' | 'update' | 'destroy' | 'toObject'>;

export type IUserMethods = {
    tokenAdd: (type: ETokenType, expirationMs: number, token: string) => Promise<string>;
    tokenRemoveAll: (type: ETokenType) => Promise<void>;
};

export type IUserModel = typeof UserModel & {
    tokenRemoveExpired(): Promise<{ status: number; success: boolean }>;
    updateMany(
        filter: Record<string, unknown>,
        update: Record<string, unknown>
    ): Promise<{ modifiedCount: number }>;
};

export const zodUserSchema = z.object({
    id: z.number().nullish(),

    email: z
        .string()
        .min(1, { message: t('signup.user-field-email-required') as string })
        .email({ message: t('signup.user-field-email-invalid') as string }),

    username: z
        .string()
        .min(1, { message: t('signup.user-field-username-required') as string })
        .min(3, { message: t('signup.user-field-username-min') as string }),

    password: z
        .string()
        .min(1, { message: t('signup.user-field-password-required') as string })
        .min(8, { message: t('signup.user-field-password-min') as string }),

    imageUrl: z.string().nullish(),

    admin: z.boolean().nullish(),
    active: z.boolean().nullish(),

    createdAt: z.date().nullish(),
    updatedAt: z.date().nullish(),
    deletedAt: z.date().nullish()
});

export const userModel = UserModel as IUserModel;

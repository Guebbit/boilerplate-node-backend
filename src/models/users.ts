import { DataTypes, Model } from 'sequelize';
import type { InferAttributes, InferCreationAttributes, CreationOptional, HasManyGetAssociationsMixin } from 'sequelize';
import { z } from "zod";
import { t } from "i18next";
import bcrypt from "bcrypt";
import { sequelize } from "@utils/database";
import { ProductModel } from "./products";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Cart Item interface
 * Reference to product and quantity
 */
export interface ICartItem {
    // ProductModel only after include()
    product?: ProductModel;
    productId: number;
    quantity: number;
    updatedAt?: Date;
}

/**
 * User tokens
 * Token is like an ID, but not really an ID
 */
export interface IToken {
    id?: number;
    token: string;
    type: string;
    expiration?: Date | null;
}

/**
 * User plain-object interface (mirrors what gets stored in session / passed around)
 */
export interface IUser {
    /**
     * User attributes
     */
    id: number;
    email: string;
    username: string;
    password: string;
    imageUrl?: string;
    admin: boolean;
    // soft delete
    deletedAt?: Date | null;

    createdAt?: Date;
    updatedAt?: Date;
}

// ---------------------------------------------------------------------------
// UserToken model
// ---------------------------------------------------------------------------

/**
 * UserToken Sequelize Model.
 * One-to-many with User (userId FK).
 * Stores password-reset tokens, 2FA tokens, etc.
 */
export class UserTokenModel
    extends Model<InferAttributes<UserTokenModel>, InferCreationAttributes<UserTokenModel>>
    implements IToken
{
    declare id: CreationOptional<number>;
    declare userId: number;
    declare type: string;
    declare token: string;
    declare expiration: CreationOptional<Date | null>;
}

UserTokenModel.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        token: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        expiration: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        tableName: 'user_tokens',
        timestamps: false,
    },
);

// ---------------------------------------------------------------------------
// CartItem model
// ---------------------------------------------------------------------------

/**
 * CartItem Sequelize Model.
 * One-to-many with User (userId FK), many-to-one with Product (productId FK).
 */
export class CartItemModel
    extends Model<InferAttributes<CartItemModel>, InferCreationAttributes<CartItemModel>>
    implements ICartItem
{
    declare id: CreationOptional<number>;
    declare userId: number;
    declare productId: number;
    declare quantity: number;
    declare updatedAt: CreationOptional<Date>;
    // populated by include(ProductModel)
    declare product?: ProductModel;
}

CartItemModel.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        productId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        quantity: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize,
        tableName: 'cart_items',
        timestamps: false,
        updatedAt: 'updatedAt',
    },
);

// ---------------------------------------------------------------------------
// User model
// ---------------------------------------------------------------------------

/**
 * User Sequelize Model.
 * Business logic (cart, auth, orders) is handled by the
 * service layer (src/services/users.ts) and repository layer
 * (src/repositories/users.ts).
 */
export class UserModel
    extends Model<InferAttributes<UserModel>, InferCreationAttributes<UserModel>>
    implements IUser
{
    declare id: CreationOptional<number>;
    declare email: string;
    declare username: string;
    declare password: string;
    declare imageUrl: CreationOptional<string>;
    declare admin: CreationOptional<boolean>;
    declare deletedAt: CreationOptional<Date | null>;
    declare readonly createdAt: CreationOptional<Date>;
    declare readonly updatedAt: CreationOptional<Date>;

    // Populated by associations
    declare cartItems?: CartItemModel[];
    declare tokens?: UserTokenModel[];

    // Association helper methods (added by Sequelize)
    declare getCartItems: HasManyGetAssociationsMixin<CartItemModel>;
    declare getTokens: HasManyGetAssociationsMixin<UserTokenModel>;
}

UserModel.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true,
            },
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        imageUrl: {
            type: DataTypes.STRING,
            defaultValue: 'https://placekitten.com/600/600',
        },
        admin: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize,
        tableName: 'users',
        timestamps: true,
    },
);

// ---------------------------------------------------------------------------
// Associations
// ---------------------------------------------------------------------------

UserModel.hasMany(CartItemModel, { foreignKey: 'userId', as: 'cartItems' });
CartItemModel.belongsTo(UserModel, { foreignKey: 'userId' });

CartItemModel.belongsTo(ProductModel, { foreignKey: 'productId', as: 'product' });
ProductModel.hasMany(CartItemModel, { foreignKey: 'productId' });

UserModel.hasMany(UserTokenModel, { foreignKey: 'userId', as: 'tokens' });
UserTokenModel.belongsTo(UserModel, { foreignKey: 'userId' });

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Hash the password before saving if it has been changed.
 */
UserModel.beforeSave(async (user) => {
    if (!user.changed('password')) return;
    user.password = await bcrypt.hash(user.password, 12);
});

// ---------------------------------------------------------------------------
// Zod validation schema
// ---------------------------------------------------------------------------

/**
 * Zod validation schema
 */
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
    deletedAt: z.date().nullish(),
});

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

/** Full Sequelize model instance (replaces Mongoose IUserDocument) */
export type IUserDocument = UserModel;

export default UserModel;
import { Table, Column, Model, DataType, CreatedAt, UpdatedAt, DeletedAt, HasMany, BeforeSave } from 'sequelize-typescript';
import { z } from "zod"
import { t } from "i18next";
import bcrypt from "bcrypt";

/**
 * Cart Item interface
 * Reference to product and quantity
 */
export interface ICartItem {
    id?: number;
    userId: number;
    productId: number;
    quantity: number;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * User tokens
 * Token is like an ID, but not really an ID
 */
export interface IToken {
    id?: number;
    userId: number;
    token: string;
    type: string;
    expiration?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * User interface
 */
export interface IUser {
    id?: number;
    /**
     * User attributes
     */
    email: string;
    username: string;
    password: string;
    imageUrl?: string;
    admin: boolean;
    // soft delete
    deletedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

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

/**
 * CartItem Model
 */
@Table({
    tableName: 'cart_items',
    timestamps: true,
})
export class CartItemModel extends Model<ICartItem> {
    @Column({
        type: DataType.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    })
    declare id: number;

    @Column({
        type: DataType.INTEGER.UNSIGNED,
        allowNull: false,
    })
    declare userId: number;

    @Column({
        type: DataType.INTEGER.UNSIGNED,
        allowNull: false,
    })
    declare productId: number;

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
    })
    declare quantity: number;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;
}

/**
 * Token Model
 */
@Table({
    tableName: 'tokens',
    timestamps: true,
})
export class TokenModel extends Model<IToken> {
    @Column({
        type: DataType.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    })
    declare id: number;

    @Column({
        type: DataType.INTEGER.UNSIGNED,
        allowNull: false,
    })
    declare userId: number;

    @Column({
        type: DataType.STRING(255),
        allowNull: false,
    })
    declare type: string;

    @Column({
        type: DataType.STRING(500),
        allowNull: false,
    })
    declare token: string;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    declare expiration?: Date;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;
}

/**
 * User Model
 */
@Table({
    tableName: 'users',
    timestamps: true,
    paranoid: true, // enables soft deletes (deletedAt)
})
export class UserModel extends Model<IUser> {
    @Column({
        type: DataType.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    })
    declare id: number;

    @Column({
        type: DataType.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true,
        },
    })
    declare email: string;

    @Column({
        type: DataType.STRING(255),
        allowNull: false,
    })
    declare username: string;

    @Column({
        type: DataType.STRING(255),
        allowNull: false,
    })
    declare password: string;

    @Column({
        type: DataType.STRING(500),
        defaultValue: "https://placekitten.com/600/600",
    })
    declare imageUrl: string;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
    declare admin: boolean;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;

    @DeletedAt
    declare deletedAt?: Date;

    @HasMany(() => CartItemModel, 'userId')
    declare cartItems?: CartItemModel[];

    @HasMany(() => TokenModel, 'userId')
    declare tokens?: TokenModel[];

    /**
     * Hook to hash password before saving
     */
    @BeforeSave
    static async hashPassword(instance: UserModel) {
        if (instance.changed('password')) {
            instance.password = await bcrypt.hash(instance.password, 12);
        }
    }
}

export default UserModel;
export { CartItemModel, TokenModel };

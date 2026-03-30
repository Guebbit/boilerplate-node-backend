import { Table, Column, Model, DataType, CreatedAt, UpdatedAt, DeletedAt, HasMany, BeforeSave } from 'sequelize-typescript';
import { z } from "zod"
import { t } from "i18next";
import bcrypt from "bcrypt";
import CartItemModel from './cart-items';
import TokenModel from './tokens';
export type { ICartItem } from './cart-items';
export type { IToken } from './tokens';
export { CartItemModel } from './cart-items';
export { TokenModel } from './tokens';

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

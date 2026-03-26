import { Table, Column, Model, DataType, CreatedAt, UpdatedAt, DeletedAt } from 'sequelize-typescript';
import { z } from "zod";
import { t } from "i18next";
import type { Product } from "@api/api"

/**
 * Product interface (plain data object)
 */
export interface IProduct extends Omit<Product, 'id'> {
    id?: number;
}

/**
 * Zod Schema for product data validation.
 * Used by the service layer to validate incoming product data.
 */
export const zodProductSchema = z.object({
    id: z.number().nullable().optional(),

    title: z
        .string()
        .min(1, { message: t('ecommerce.product-invalid-title-required') as string })
        .min(5, { message: t('ecommerce.product-invalid-title-min') as string }),

    price: z
        .number({ message: t('ecommerce.product-invalid-price-invalid') as string })
        .refine((v) => v !== undefined && v !== null, {
            message: t('ecommerce.product-invalid-price-required') as string,
        }),

    description: z.string().optional(),
    imageUrl: z.string().optional(),

    active: z.boolean().nullable().optional(),
    createdAt: z.date().nullable().optional(),
    updatedAt: z.date().nullable().optional(),
    deletedAt: z.date().nullable().optional(),
});

/**
 * Sequelize Model for the Product
 */
@Table({
    tableName: 'products',
    timestamps: true,
    paranoid: true, // enables soft deletes (deletedAt)
})
export class ProductModel extends Model<IProduct> {
    @Column({
        type: DataType.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    })
    declare id: number;

    @Column({
        type: DataType.STRING(255),
        allowNull: false,
    })
    declare title: string;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
    })
    declare price: number;

    @Column({
        type: DataType.TEXT,
        defaultValue: "",
    })
    declare description: string;

    @Column({
        type: DataType.STRING(500),
        defaultValue: "https://placekitten.com/400/400",
    })
    declare imageUrl: string;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
    declare active: boolean;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;

    @DeletedAt
    declare deletedAt?: Date;
}

export default ProductModel;

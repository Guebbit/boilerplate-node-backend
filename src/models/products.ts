import { DataTypes, Model } from 'sequelize';
import type { InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import { z } from "zod";
import { t } from "i18next";
import { sequelize } from "@utils/database";
import type { Product } from "@api/api";

/**
 * Product Document interface (Sequelize model attributes)
 */
export interface IProductAttributes {
    id: CreationOptional<number>;
    title: string;
    price: number;
    description: string;
    imageUrl: string;
    active: CreationOptional<boolean>;
    deletedAt: CreationOptional<Date | null>;
    createdAt: CreationOptional<Date>;
    updatedAt: CreationOptional<Date>;
}

/**
 * Product Sequelize Model.
 * Business logic (search, remove, validate) is now handled by the
 * service layer (src/services/products.ts) and repository layer
 * (src/repositories/products.ts).
 */
export class ProductModel
    extends Model<InferAttributes<ProductModel>, InferCreationAttributes<ProductModel>>
    implements IProductAttributes
{
    declare id: CreationOptional<number>;
    declare title: string;
    declare price: number;
    declare description: string;
    declare imageUrl: string;
    declare active: CreationOptional<boolean>;
    declare deletedAt: CreationOptional<Date | null>;
    declare readonly createdAt: CreationOptional<Date>;
    declare readonly updatedAt: CreationOptional<Date>;
}

/**
 * Zod Schema for product data validation.
 * Used by the service layer to validate incoming product data.
 */
export const zodProductSchema = z.object({
    id: z.number().nullable().optional(),

    title: z
        .string()
        .min(1, { error: t('ecommerce.product-invalid-title-required') })
        .min(5, { error: t('ecommerce.product-invalid-title-min') }),

    price: z
        .number({ error: t('ecommerce.product-invalid-price-invalid') })
        .refine((v) => v !== undefined && v !== null, {
            error: t('ecommerce.product-invalid-price-required'),
        }),

    imageUrl: z
        .string()
        .min(1, { error: t('ecommerce.product-invalid-image-required') }),

    active: z.boolean().nullable().optional(),
    createdAt: z.date().nullable().optional(),
    updatedAt: z.date().nullable().optional(),
    deletedAt: z.date().nullable().optional(),
});

/**
 * Sequelize model definition for the Product table
 */
ProductModel.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        price: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            defaultValue: '',
        },
        imageUrl: {
            type: DataTypes.STRING,
            defaultValue: 'https://placekitten.com/400/400',
        },
        active: {
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
        tableName: 'products',
        timestamps: true,
    },
);

/**
 * Plain-object type returned by toJSON() / get({ plain: true })
 * Compatible with the API-generated Product type.
 */
export type IProductDocument = ProductModel;

// Re-export for compatibility with API type alias
export type { Product };

export default ProductModel;
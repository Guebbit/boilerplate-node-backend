import { DataTypes, Model } from 'sequelize';
import { z } from 'zod';
import { t } from 'i18next';
import type { Product } from '@types';
import { sequelize } from '@utils/database';

export class ProductModel extends Model {
    declare id: number;
    declare _id: number;
    declare title: string;
    declare price: number;
    declare description: string;
    declare imageUrl: string;
    declare active: boolean;
    declare deletedAt: Date | null;
    declare createdAt: Date;
    declare updatedAt: Date;

    toObject() {
        return this.get({ plain: true });
    }
}

ProductModel.init(
    {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        _id: {
            type: DataTypes.VIRTUAL,
            get() {
                return (this as ProductModel).id;
            }
        },
        title: { type: DataTypes.STRING, allowNull: false },
        price: { type: DataTypes.FLOAT, allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
        imageUrl: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'https://placekitten.com/400/400'
        },
        active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        deletedAt: { type: DataTypes.DATE, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    },
    {
        sequelize,
        modelName: 'Product',
        tableName: 'products',
        timestamps: true,
        indexes: [
            { fields: ['active'] },
            { fields: ['deletedAt'] },
            { fields: ['createdAt'] },
            { fields: ['title'] }
        ]
    }
);

export type IProductDocument = ProductModel;
export type IProductMethods = unknown;
export type IProductModel = typeof ProductModel;

export const zodProductSchema = z.object({
    id: z.number().nullable().optional(),

    title: z
        .string()
        .min(1, { error: t('ecommerce.product-invalid-title-required') })
        .min(5, { error: t('ecommerce.product-invalid-title-min') }),

    price: z
        .number({ error: t('ecommerce.product-invalid-price-invalid') })
        .refine((v) => v !== undefined && v !== null, {
            error: t('ecommerce.product-invalid-price-required')
        }),

    imageUrl: z.string(),

    active: z.boolean().nullable().optional(),
    createdAt: z.date().nullable().optional(),
    updatedAt: z.date().nullable().optional(),
    deletedAt: z.date().nullable().optional(),
    description: z.string().optional()
});

export const productModel = ProductModel;

import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    Op,
    NonAttribute,
} from 'sequelize';
import { z } from "zod";
import { t } from "i18next";
import db from "../utils/db";
import CartItems from "./cart-items";

/**
 * Zod validation schema
 */
export const ZodProductSchema =
    z.object({
        id: z.number().nullish().optional(),
        title: z
            .string({
                required_error: t('ecommerce.product-field-title-required'),
            })
            .min(5, t('ecommerce.product-field-title-min')),
        price: z.number({
            required_error: t('ecommerce.product-field-price-required'),
            invalid_type_error: t('ecommerce.product-field-price-invalid')
        }),
        imageUrl: z
            .string({
                required_error: t('ecommerce.product-field-image-required'),
            }),
        active: z.boolean().nullish().optional(),
        createdAt: z.date().nullish().optional(),
        updatedAt: z.date().nullish().optional(),
        deletedAt: z.date().nullish().optional(),
    });

/**
 * Model with typescript
 *
 * Order of InferAttributes & InferCreationAttributes is important
 *
 * id, createdAt and updatedAt are filled by MySQL automatically
 *
 * "CreationOptional" is a special type that marks the field as optional
 * when creating an instance of the model (such as using Model.create())
 */
class Products extends Model<InferAttributes<Products>, InferCreationAttributes<Products>> {
    declare id: CreationOptional<number>;
    declare title: string;
    declare price: number;
    declare imageUrl: string;
    declare description: string;
    declare active: CreationOptional<boolean>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date | null>;
    declare deletedAt: CreationOptional<Date | null>;

    /**
     * HasMany Association (through CartItem) - Cart
     */
    declare CartItems: NonAttribute<CartItems>;

    static validateData(productData: Partial<Products>){
        /**
         * Validation
         */
        const parseResult = ZodProductSchema
            .safeParse(productData);

        /**
         * Validation error
         */
        if (!parseResult.success)
            return parseResult.error.issues.reduce((errorArray, { message }) => {
                errorArray.push(message);
                return errorArray;
            }, [] as string[]);

        return [];
    }
}

Products.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
            allowNull: false,
        },
        title: DataTypes.STRING,
        price: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        imageUrl: {
            type: DataTypes.STRING,
            allowNull: false
        },
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        description: {
            type: new DataTypes.STRING(512),
            allowNull: false
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize: db,
        tableName: 'products',
        paranoid: true,
        defaultScope: {
            where: {
                [Op.and]: [
                    {
                        deletedAt: null
                    },
                    {
                        active: true
                    }
                ]
            }
        },
        scopes: {
            admin: {
                paranoid: false
            },
            lowCost: {
                where: {
                    [Op.and]: [
                        {
                            price: {
                                [Op.lt]: 30
                            }
                        },
                        {
                            active: true
                        }
                    ]
                }
            }
        }
    }
);

export default Products;
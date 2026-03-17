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
import database from "../utils/database";
import Carts from "./carts";
import CartItems from "./cart-items";
import {generateReject, generateSuccess, IResponseReject, IResponseSuccess} from "../utils/response";
import {deleteFile} from "../utils/filesystem-helpers";

/**
 * Zod validation schema
 */
export const zodProductSchema = z.object({
    id: z.number().optional().nullable(),

    title: z
        .string({
            error: t('ecommerce.product-field-title-required'),
        })
        .min(5, {
            error: t('ecommerce.product-field-title-min'),
        }),

    price: z.number({
        error: t('ecommerce.product-field-price-required'),
    }),

    imageUrl: z.string({
        error: t('ecommerce.product-field-image-required'),
    }),

    active: z.boolean().optional().nullable(),
    createdAt: z.date().optional().nullable(),
    updatedAt: z.date().optional().nullable(),
    deletedAt: z.date().optional().nullable(),
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

    /**
     * STATIC method
     * Data validation
     * Check if product info are compliant
     *
     * @param productData
     */
    static validateData(productData: Partial<Products>){
        /**
         * Validation
         */
        const parseResult = zodProductSchema
            .safeParse(productData);

        /**
         * Validation error
         */
        if (!parseResult.success)
            return parseResult.error.issues.map(({message}) => message)

        return [];
    }

    /**
     * STATIC method
     * Remove product from database by ID
     *
     * @param id
     * @param hardDelete
     */
    static async productRemoveById(id: string, hardDelete = false): Promise<IResponseSuccess<Products> | IResponseSuccess<undefined> | IResponseReject>{
        return Products.scope("admin").findByPk(id)
            .then(async (product) => {
                if(!product)
                    return generateReject(404, "404", [t("ecommerce.product-not-found")]);
                // HARD delete
                if(hardDelete){
                    return Carts.productRemoveFromCarts(id)
                        .then(() => product.destroy({ force: true }))
                        .then(() => deleteFile((process.env.NODE_PUBLIC_PATH ?? "public") + product.imageUrl))
                        .then(() => generateSuccess(undefined, 200, t("ecommerce.product-hard-deleted")));                }
                // If deletedAt already present: it's soft deleted: RESTORE
                if(product.deletedAt)
                    return product.restore()
                        .then(() => generateSuccess(product))
                // SOFT delete.
                return Carts.productRemoveFromCarts(id)
                    .then(() => product.destroy())
                    // eslint-disable-next-line unicorn/no-useless-undefined
                    .then(() => generateSuccess(undefined))
            })
    }


    /**
     * INSTANCE method
     * Remove product from database
     *
     * @param id
     * @param hardDelete
     */
    static async productRemove(id: string, hardDelete = false){
        return this.productRemoveById(id, hardDelete);
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
        sequelize: database,
        tableName: 'products',
        paranoid: true,
        defaultScope: {
            where: {
                [Op.and]: [
                    {
                        // eslint-disable-next-line unicorn/no-null
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
                paranoid: false,
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
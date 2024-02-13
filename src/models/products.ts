import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    Op, NonAttribute,
} from 'sequelize';
import { z } from "zod";
import db from "../utils/db";
import CartItems from "./cart-items";

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
    declare active: boolean;
    declare createdAt: CreationOptional<number>;
    declare updatedAt: CreationOptional<number>;
    declare deletedAt: CreationOptional<number>;

    /**
     * HasMany Association (through CartItem) - Cart
     */
    declare CartItems: NonAttribute<CartItems>;
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
        updatedAt: DataTypes.DATE,
        deletedAt: DataTypes.DATE,
    },
    {
        sequelize: db,
        tableName: 'products',
        paranoid: true,
        defaultScope: {
            where: {
                active: true
            }
        },
        scopes: {
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

export const ProductSchema =
    z.object({
        id: z.number().nullish().optional(),
        title: z
            .string({
                required_error: "Title is required",
            })
            .min(5, "Title is too short"),
        price: z.number(),
        imageUrl: z
            .string({
                required_error: "Image is required",
            }),
        createdAt: z.date().nullish().optional(),
        updatedAt: z.date().nullish().optional(),
    });

export default Products;
import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    NonAttribute,
    HasManyCountAssociationsMixin,
    HasManyGetAssociationsMixin,
    HasManyHasAssociationsMixin,
    HasManyRemoveAssociationsMixin,
    HasManyAddAssociationsMixin,
    HasManyAddAssociationMixin,
    HasManyRemoveAssociationMixin, 
    HasManySetAssociationsMixin, 
    HasManyHasAssociationMixin,
    HasManyCreateAssociationMixin,
    HasOneCreateAssociationMixin,
    HasOneGetAssociationMixin,
} from 'sequelize';
import { z } from "zod";
import db from "../utils/db";
import Orders from "./orders";
import Tokens from "./tokens";
import Cart from "./cart";
import Products from "./products";
import CartItems from "./cart-items";

class Users extends Model<InferAttributes<Users>, InferCreationAttributes<Users>> {
    declare id: CreationOptional<number>;
    declare email: string;
    declare username: string;
    declare password: string;
    declare imageUrl: CreationOptional<string>;
    declare admin: CreationOptional<boolean>;
    declare createdAt: CreationOptional<number>;
    declare updatedAt: CreationOptional<number>;
    declare deletedAt: CreationOptional<number>;

    /**
     * HasOne Association - Cart
     */
    declare createCart: HasOneCreateAssociationMixin<Cart>;
    declare getCart: HasOneGetAssociationMixin<Cart>;

    /**
     * HasMany Association - Orders
     */
    declare getOrders: HasManyGetAssociationsMixin<Orders>;
    declare addOrder: HasManyAddAssociationMixin<Orders, number>;
    declare addOrders: HasManyAddAssociationsMixin<Orders, number>;
    declare setOrders: HasManySetAssociationsMixin<Orders, number>;
    declare removeOrder: HasManyRemoveAssociationMixin<Orders, number>;
    declare removeOrders: HasManyRemoveAssociationsMixin<Orders, number>;
    declare hasOrder: HasManyHasAssociationMixin<Orders, number>;
    declare hasOrders: HasManyHasAssociationsMixin<Orders, number>;
    declare countOrders: HasManyCountAssociationsMixin;
    declare createOrder: HasManyCreateAssociationMixin<Orders>;

    /**
     * HasMany Association - Tokens
     */
    declare createToken: HasManyCreateAssociationMixin<Tokens>;

    /**
     * defaultScope joined element
     */
    declare Cart: NonAttribute<Cart>;

    /**
     * Custom method
     */
    declare addToCart: NonAttribute<(product: Products, quantity: number) => Promise<unknown>>;
}

Users.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        username: {
            type: new DataTypes.STRING(),
            allowNull: false
        },
        password: {
            type: new DataTypes.STRING(),
            allowNull: false
        },
        imageUrl: {
            type: DataTypes.STRING,
            defaultValue: "https://placekitten.com/500/500",
        },
        admin: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
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
        /**
         * database connection
         */
        sequelize: db,

        /**
         * Table name in the database
         */
        tableName: 'users',

        /**
         * Soft deletion
         * when a row is deleted, "deletedAt" is updated instead
         * (unless .destroy({ force: true })
         *
         * can use .restore({ where: * }) to revert deletion
         */
        paranoid: true,

        /**
         * Default scope (for every non-scoped request)
         * can be nullified with .unscope()
         */
        defaultScope: {
            // get user already joined with his cart
            include: [{
                    model: Cart,
                },
            ]
        },

        /**
         * Hooks that happens at specific points
         */
        hooks: {
            /**
             * Hook that happen before creation and can be used for validation
             * @param user
             */
            beforeCreate(user){
                if(user.username === "not-allowed")
                    throw new Error("username not allowed")
            }
        },
    }
);

/**
 * Custom method
 * Add a single product to the cart
 *
 * @param product
 * @param quantity
 */
Users.prototype.addToCart = function(product, quantity = 0) {

    console.log("ADD PRODUCTS")

    if(!product)
        return Promise.reject([]);

    /**
     * Find if already existing items in cart
     */
    return this.Cart
        .getCartItems({
            where: {
                productId: product.id
            }
        })
        .then((items): Promise<unknown> => {
            /**
             * Edit the cart item that where found
             */
            if(items.length > 0){
                // it's the same as below
                // for(let i = items.length; i--; ){
                //     items[i].quantity += quantity;
                //     items[i].save();
                // }

                // it's the same as below
                // const promiseArray: Promise<unknown>[] = [];
                // items.map((product) => {
                //     product.quantity += quantity;
                //     promiseArray.push(product.save());
                // })
                // return Promise.all(promiseArray);

                return Promise.all(
                    items.map((product) => {
                        product.quantity += quantity;
                        return product.save();
                    })
                );
            }
            
            /**
             * No product found, create new
             */
            return this.Cart
                .addProduct(product, {
                    through: {
                        quantity
                    }
                })
        })
};

/**
 *
 */
export const UserSchema =
    z.object({
        id: z.number().nullish().optional(),
        email: z
            .string({
                required_error: "Email is required",
            })
            .email("Not a valid email"),
        username: z
            .string({
                required_error: "Username is required",
            })
            .min(3, "Name is too short"),
        password: z
            .string({
                required_error: "Username is required",
            })
            .min(8, "Password is too short"),
        imageUrl: z.string().nullish().optional(),
        admin: z.boolean().nullish().optional(),
        createdAt: z.date().nullish().optional(),
        updatedAt: z.date().nullish().optional(),
    });

export default Users;
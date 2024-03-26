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
    WhereOptions,
} from 'sequelize';
import bcrypt from "bcrypt";
import { z } from "zod";
import { t } from "i18next";
import db from "../utils/db";
import Orders from "./orders";
import Tokens from "./tokens";
import Cart from "./cart";
import Products from "./products";
import CartItems from "./cart-items";
import { randomBytes } from "crypto";

export type CartGetResponse = InferAttributes<Cart> & {
    CartItems?: Array<CartItems & {
        Product: Products
    }>
}

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
     * INSTANCE method
     *
     * Extended getCart from hasOne association
     * Cart include it's (HasMany) CartItems
     * Every CartItems include (HasOne) Product
     */
    async cartGet() {
        return this.getCart({
            include: [{
                model: CartItems,
                // in case the cart is empty
                required: false,
                include: [{
                    model: Products,
                    // should never happen, but keep it as a failsafe
                    required: false,
                }],
            }]
        })
            .then((cart) => cart.toJSON() as CartGetResponse);
    }

    /**
     * INSTANCE method
     * Add single product to cart
     *
     * @param product
     * @param quantity
     */
    async cartItemSet(product: Products, quantity = 1) {
        return this.Cart
            .getCartItems({
                where: {
                    productId: product.id
                }
            })
            .then((items): Promise<unknown> => {
                /**
                 * An array of 1 is returned (if already present)
                 * For testing purposes I update all items in array (in multiple ways)
                 */
                if(items.length > 0){
                    // it's the same as below
                    // for(let i = items.length; i--; ){
                    //     items[i].quantity = quantity;
                    //     items[i].save();
                    // }

                    // it's the same as below
                    // const promiseArray: Promise<unknown>[] = [];
                    // items.map((product) => {
                    //     product.quantity = quantity;
                    //     promiseArray.push(product.save());
                    // })
                    // return Promise.all(promiseArray);

                    return Promise.all(
                        items.map((product) => {
                            product.quantity = quantity;
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
    }

    /**
     * INSTANCE method
     *
     * @param productId
     */
    async cartItemRemove(productId: string) {
        this.getCart()
            .then((cart) => CartItems.destroy({
                where: {
                    cartId: cart.id,
                    productId
                }
            })
        )
        return this;
    }

    /**
     * INSTANCE method
     * 
     * Remove ALL items from cart
     */
    async cartRemove() {
        this.getCart()
            .then((cart) => CartItems.destroy({
                    where: {
                        cartId: cart.id
                    }
                })
            )
        return this;
    }

    /**
     * INSTANCE method
     *
     * Create a new order with the current cart
     * then reset the cart
     */
    async orderConfirm(){
        return this
            .getCart()
            .then((cart) =>
                cart.getProducts()
                    .then((products) => {
                        return {
                            cart,
                            products
                        }
                    })
            )
            .then(({ cart, products }) => {
                if(products.length < 1)
                    throw new Error("empty");
                return this.createOrder({
                    email: this.email
                })
                    .then((order) =>
                        Promise.all([
                            ...products.map((product) => {
                                return order.addProduct(product, {
                                    through: {
                                        quantity: product.CartItems.quantity
                                    }
                                })
                            }),
                            cart.removeProducts(products),
                        ])
                    )
            })
    }

    /**
     * INSTANCE (schema) method
     *
     * Add token to user
     * (like password reset)
     *
     * @param type
     * @param expirationTime - undefined = expire only upon use
     */
    tokenAdd(type: string, expirationTime?: number) {
        const token = randomBytes(16).toString('hex');

        this.createToken({
            type,
            token,
            expiration: expirationTime ? (Date.now() + expirationTime) : undefined,
        })
            .catch((error: Error) => {
                console.log("tokenAdd ERROR", error)
            });
        return token;
    };

    /**
     * INSTANCE (schema) method
     *
     * Change password
     */
    async passwordChange(password = "", passwordConfirm = "") {
        /**
         * Data validation
         * Check if password and passwordConfirm are equals and compliant
         */
        const parseResult = ZodUserSchema
            .pick({
                password: true,
            })
            .extend({
                passwordConfirm: z.string(),
            })
            .superRefine(({passwordConfirm, password}, ctx) => {
                if (passwordConfirm !== password) {
                    ctx.addIssue({
                        code: "custom",
                        message: t("signup.password-dont-match")
                    });
                }
            })
            .safeParse({
                password,
                passwordConfirm
            });

        /**
         * Validation error
         */
        if (!parseResult.success)
            return Promise.reject(
                parseResult.error.issues.reduce((errorArray, { message }) => {
                    errorArray.push(message);
                    return errorArray;
                }, [] as string[])
            );

        /**
         * Everything is ok, change password with the requested one.
         * Encryption will be done automatically by another hook
         */
        this.password = password;
        return this.save();
    }

    /**
     * STATIC method
     * 
     * Register new user
     *
     * @param email
     * @param username
     * @param imageUrl
     * @param password
     * @param passwordConfirm
     */
    static async signup(
        email: string,
        username: string,
        imageUrl: string,
        password: string,
        passwordConfirm: string
    ){
        /**
         * Data validation
         * Check if user data are compliant
         */
        const parseResult = ZodUserSchema
            .extend({
                passwordConfirm: z.string(),
            })
            .superRefine(({passwordConfirm, password}, ctx) => {
                if (passwordConfirm !== password)
                    ctx.addIssue({
                        code: "custom",
                        message: t("signup.password-dont-match")
                    });
            }).safeParse({
                email,
                username,
                imageUrl,
                password,
                passwordConfirm,
            });

        /**
         * Validation error
         */
        if (!parseResult.success)
            return Promise.reject(
                parseResult.error.issues.reduce((errorArray, { message }) => {
                    errorArray.push(message);
                    return errorArray;
                }, [] as string[])
            );

        /**
         * Check if email is already used (user exist already probably)
         * If that's the case: return error and stop the creation process
         */
        return Users.findOne({
            where: {
                email,
            }
        })
            .then((user) => {
                // Email already exists
                if (user)
                    return Promise.reject([
                        t('signup.email-already-used')
                    ]);

                /**
                 * Everything is ok, proceed to create a new user.
                 * Encryption will be done automatically by another hook
                 */
                return new Users({
                    username,
                    email,
                    imageUrl,
                    password,
                })
                    .save()
                    .then((user) => {
                        // User creation successful, now create their cart
                        user.createCart();
                        return user;
                    })
            });
    }

    /**
     * STATIC method
     *
     * Login user
     *
     * @param email
     * @param password
     */
    static async login(email?: string, password?: string){
        /**
         * Data validation
         * Check if password and passwordConfirm are equals and compliant
         */
        const parseResult = ZodUserSchema
            .pick({
                email: true
            }).extend({
                password: z.string(),
            }).safeParse({
                email,
                password
            });

        /**
         * Validation error
         */
        if (!parseResult.success)
            return Promise.reject(
                parseResult.error.issues.reduce((errorArray, { message }) => {
                    errorArray.push(message);
                    return errorArray;
                }, [] as string[])
            );

        /**
         * Everything is ok, login the user
         */
        return this.findOne({
            where: {
                email,
                deletedAt: null
            } as WhereOptions
        })
            .then(user => {
                // user not found
                if (!user)
                    return Promise.reject([
                        t('login.wrong-data')
                    ]);
                return bcrypt
                    .compare(password || "", user.password)
                    .then(doMatch => {
                        // User found but password doesn't match
                        if (!doMatch) {
                            return Promise.reject([
                                t('login.wrong-data')
                            ]);
                        }
                        return user;
                    });
            });
    }
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
                // regular but not allowed names
                if(user.username === "not-allowed")
                    throw new Error("username not allowed");
                // hash password at every creation
                return bcrypt.hash(user.password, 12)
                    .then(hashedPassword => {
                        user.password = hashedPassword;
                    });
            },

            /**
             * Same as beforeCreate, but for updates
             * @param user
             */
            beforeUpdate: async (user) => {
                if (user.changed('password'))
                    return bcrypt.hash(user.password, 12)
                        .then(hashedPassword => {
                            user.password = hashedPassword;
                        });
            }
        },
    }
);

/**
 * Zod validation schema
 */
export const ZodUserSchema =
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
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
    Op, ValidationError, DatabaseError,
} from 'sequelize';
import {randomBytes} from "node:crypto";
import bcrypt from "bcrypt";
import {z} from "zod";
import {t} from "i18next";
import database from "../utils/database";
import {generateSuccess, generateReject} from "../utils/response";
import Orders from "./orders";
import Tokens from "./tokens";
import Carts from "./carts";
import Products from "./products";
import CartItems from "./cart-items";
import {databaseErrorInterpreter} from "../utils/error-helpers";

class Users extends Model<InferAttributes<Users>, InferCreationAttributes<Users>> {
    declare id: CreationOptional<number>;
    declare email: string;
    declare username: string;
    declare password: string;
    declare imageUrl: CreationOptional<string>;
    declare admin: CreationOptional<boolean>;
    declare active: CreationOptional<boolean>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date | null>;
    declare deletedAt: CreationOptional<Date | null>;

    /**
     * HasOne Association - Cart
     */
    declare createCart: HasOneCreateAssociationMixin<Carts>;
    declare getCart: HasOneGetAssociationMixin<Carts>;

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
    declare Cart: NonAttribute<Carts>;

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
            .then((cart) => cart.toJSON());
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
            .then(async (items) => {
                /**
                 * An array of 1 is returned (if already present)
                 * For testing purposes I update all items in array (in multiple ways)
                 */
                if (items.length > 0) {
                    // it's the same as below
                    // for(let i = items.length; i--; ){
                    //     items[i].quantity = quantity;
                    //     await items[i].save();
                    // }

                    await Promise.all(
                        items.map((product) => {
                            product.quantity = quantity;
                            return product.save();
                        })
                    )
                    return generateSuccess(await this.cartGet())
                }

                /**
                 * No product found, create new
                 */
                await this.Cart.addProduct(product, {
                    through: {
                        quantity
                    }
                })
                return generateSuccess(await this.cartGet())
            })
    }

    /**
     * INSTANCE (schema) method
     *
     * Remove target product from cart
     * @param productId
     */
    async cartItemRemoveById(productId: string | number) {
        return this.getCart()
            .then(async (cart) => {
                await CartItems.destroy({
                    where: {
                        CartId: cart.id,
                        productId
                    }
                })
                return generateSuccess(await this.getCart());
            })
    }

    /**
     * INSTANCE (schema) method
     *
     * Remove target product from cart
     * @param product
     */
    async cartItemRemove(product: Products) {
        return this.cartItemRemoveById(product.id);
    }

    /**
     * INSTANCE method
     *
     * Remove ALL items from cart
     */
    async cartRemove() {
        return this.getCart()
            .then(async (cart) =>
                generateSuccess(
                    await CartItems.destroy({
                        where: {
                            CartId: cart.id
                        }
                    })
                )
            )
    }

    /**
     * INSTANCE method
     *
     * Create a new order with the current cart
     * then reset the cart
     */
    async orderConfirm() {
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
            .then(async ({cart, products}) => {
                if (products.length === 0)
                    return generateReject(
                        404,
                        "no products",
                        [t('generic.error-missing-data')]
                    )
                return generateSuccess(
                    await this.createOrder({
                        email: this.email
                    })
                        .then(async (order) => {
                            await Promise.all([
                                ...products.map((product) => {
                                    return order.addProduct(product, {
                                        through: {
                                            quantity: product.CartItems.quantity
                                        }
                                    })
                                }),
                                cart.removeProducts(products),
                            ])
                            return order;
                        })
                );
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
    async tokenAdd(type: string, expirationTime?: number) {
        const token = randomBytes(16).toString('hex');
        return this.createToken({
            type,
            token,
            expiration: expirationTime ? (Date.now() + expirationTime) : undefined,
        })
            .then(() => token)
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
        const parseResult = zodUserSchema
            .pick({
                password: true,
            })
            .extend({
                passwordConfirm: z.string(),
            })
            .superRefine(({passwordConfirm, password}, context) => {
                if (passwordConfirm !== password) {
                    context.addIssue({
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
            return generateReject(
                400,
                "passwordChange - bad request",
                parseResult.error.issues.map(({message}) => message)
            )

        /**
         * Everything is ok, change password with the requested one.
         * Encryption will be done automatically by another hook
         */
        this.password = password;
        return this.save()
            .then((user) => generateSuccess(user))
            .catch((error: ValidationError | DatabaseError | Error) =>
                generateReject(500, databaseErrorInterpreter(error).join(", "))
            );
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
        password: string,
        passwordConfirm: string,
        imageUrl: string | null = "",
    ) {
        /**
         * Data validation
         * Check if user data are compliant
         */
        const parseResult = zodUserSchema
            .extend({
                passwordConfirm: z.string(),
            })
            .superRefine(({passwordConfirm, password}, context) => {
                if (passwordConfirm !== password)
                    context.addIssue({
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
            return generateReject(
                400,
                "signup - bad request",
                parseResult.error.issues.map(({message}) => message)
            )

        /**
         * Check if email is already used (user exist already probably)
         * If that's the case: return error and stop the creation process
         */
        return Users.findOne({
            where: {
                email,
            }
        })
            .then(async (user) => {
                // Email already exists
                if (user)
                    return generateReject(
                        409,
                        "signup - email already used",
                        [t('signup.email-already-used')]
                    )

                /**
                 * Everything is ok, proceed to create a new user.
                 * Encryption will be done automatically by another hook
                 */
                return generateSuccess(
                    await new Users({
                        username,
                        email,
                        imageUrl,
                        password,
                    })
                        .save()
                        .then(async (user) => {
                            // User creation successful, now create their cart
                            await user.createCart();
                            return user;
                        })
                )
            })
    }

    /**
     * STATIC method
     *
     * Login user
     *
     * @param email
     * @param password
     */
    static async login(email?: string, password?: string) {
        /**
         * Data validation
         * Check if password and passwordConfirm are equals and compliant
         */
        const parseResult = zodUserSchema
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
            return generateReject(
                400,
                "login - bad request",
                parseResult.error.issues.map(({message}) => message)
            )

        /**
         * Everything is ok, login the user
         */
        return this.findOne({
            where: {
                email,
                // eslint-disable-next-line unicorn/no-null
                deletedAt: null
            } as WhereOptions
        })
            .then(user => {
                // user not found
                if (!user)
                    return generateReject(
                        401,
                        "login - wrong credentials",
                        [t('login.wrong-data')]
                    )
                return bcrypt
                    .compare(password ?? "", user.password)
                    .then(doMatch => {
                        // User found but password doesn't match
                        if (!doMatch)
                            return generateReject(
                                401,
                                "login - wrong credentials",
                                [t('login.wrong-data')]
                            )
                        return generateSuccess(user);
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
        active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
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
        sequelize: database,

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
         * Default scope (for regular users)
         */
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
            },
            // get user already joined with his cart
            include: [{
                model: Carts,
                required: false // it should be always present
            }]
        },

        scopes: {
            /**
             * Show all
             */
            admin: {
                paranoid: false,
                include: [{
                    model: Carts,
                    required: false // it should be always present
                }]
            },
        },

        /**
         * Hooks that happens at specific points
         */
        hooks: {
            /**
             * Hook that happen before creation and can be used for validation
             * @param user
             */
            beforeCreate(user) {
                // regular but not allowed names
                if (user.username === 'not-allowed')
                    throw new Error('username not allowed');
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
export const zodUserSchema =
    z.object({
        id: z.number().optional().nullable(),
        email: z
            .string({
                required_error: t('signup.user-field-email-required'),
            })
            .email(t('signup.user-field-email-invalid')),
        username: z
            .string({
                required_error: t('signup.user-field-username-required'),
            })
            .min(3, t('signup.user-field-username-min')),
        password: z
            .string({
                required_error: t('signup.user-field-password-required'),
            })
            .min(8, t('signup.user-field-password-min')),
        imageUrl: z.string().optional().nullable(),
        admin: z.boolean().optional().nullable(),
        active: z.boolean().optional().nullable(),
        createdAt: z.date().optional().nullable(),
        updatedAt: z.date().optional().nullable(),
        deletedAt: z.date().optional().nullable(),
    });

export default Users;
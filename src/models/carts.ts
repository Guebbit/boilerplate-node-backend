import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,

    HasManyGetAssociationsMixin,
    BelongsToManyGetAssociationsMixin,
    BelongsToManyAddAssociationMixin,
    BelongsToManyRemoveAssociationsMixin,
    NonAttribute,
    type DatabaseError,
    type ValidationError,
} from 'sequelize';


import db from "../utils/db";
import Users from "./users";
import Products from "./products";
import CartItems from "./cart-items";
import {generateReject, generateSuccess, IResponseReject, IResponseSuccess} from "../utils/response";
import {t} from "i18next";
import {databaseErrorInterpreter} from "../utils/error-helpers";

class Carts extends Model<InferAttributes<Carts>, InferCreationAttributes<Carts>> {
    declare id: CreationOptional<number>;
    declare userId: ForeignKey<Users['id']>;
    declare createdAt: CreationOptional<number>;
    declare updatedAt: CreationOptional<number>;

    /**
     * BelongsTo Association - CartItems
     */
    declare getCartItems: HasManyGetAssociationsMixin<CartItems>;

    /**
     * BelongsToMany Association (through CartItem) - Products
     */
    declare addProduct: BelongsToManyAddAssociationMixin<Products, Products['id']>;
    declare getProducts: BelongsToManyGetAssociationsMixin<Products>;
    declare removeProducts: BelongsToManyRemoveAssociationsMixin<Products, Products['id']>;

    /**
     * defaultScope joined element
     */
    declare CartItems: NonAttribute<CartItems[]>;

    /**
     * STATIC method
     * Remove product from database by ID
     *
     * @param id
     */
    static async productRemoveFromCarts(id: string): Promise<IResponseSuccess<undefined> | IResponseReject> {
        return CartItems.destroy({
            where: {
                productId: id
            }
        })
            .then((modifiedCount) => {
                return generateSuccess(
                    undefined,
                    200,
                    t('ecommerce.product-was-deleted-from-all-carts', {
                        product: id,
                        count: modifiedCount
                    })
                );
            })
            .catch((error: Error | ValidationError | DatabaseError) => generateReject(500, databaseErrorInterpreter(error).join(", ")))
    }

}

Carts.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize: db,
        tableName: 'cart'
    }
);

export default Carts;
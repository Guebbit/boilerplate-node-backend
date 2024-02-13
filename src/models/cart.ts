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
} from 'sequelize';
import db from "../utils/db";
import Users from "./users";
import Products from "./products";
import CartItems from "./cart-items";

class Cart extends Model<InferAttributes<Cart>, InferCreationAttributes<Cart>> {
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
}

Cart.init(
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

export default Cart;
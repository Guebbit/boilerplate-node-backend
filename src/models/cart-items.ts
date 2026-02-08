import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey
} from 'sequelize';
import database from "../utils/database";
import Products from "./products";
import Carts from "./carts";

class CartItems extends Model<InferAttributes<CartItems>, InferCreationAttributes<CartItems>> {
    declare id: CreationOptional<number>;
    declare quantity: number;
    declare CartId: ForeignKey<Carts['id']>;
    declare productId: ForeignKey<Products['id']>;
    declare createdAt: CreationOptional<number>;
    declare updatedAt: CreationOptional<number>;
}

CartItems.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        quantity: DataTypes.INTEGER,
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize: database,
        tableName: 'cart-items'
    }
);

export default CartItems;
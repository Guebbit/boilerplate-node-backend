import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    BelongsToManyAddAssociationMixin,
    BelongsToManyGetAssociationsMixin
} from 'sequelize';
import db from "../utils/db";
import Users from "./users";
import Products from "./products";
import OrderItems from "./order-items";

class Orders extends Model<InferAttributes<Orders>, InferCreationAttributes<Orders>> {
    declare id: CreationOptional<number>;
    declare userId: ForeignKey<Users['id']>;
    declare createdAt: CreationOptional<number>;
    declare updatedAt: CreationOptional<number>;

    /**
     * BelongsToMany Association (through CartItem) - Products
     */
    declare addProduct: BelongsToManyAddAssociationMixin<Products, Products['id']>;
    declare getProducts: BelongsToManyGetAssociationsMixin<Products>;

    /**
     * BelongsToMany Association (through CartItem) - Products
     */
    declare getOrderItems: BelongsToManyGetAssociationsMixin<OrderItems>;
}

Orders.init(
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
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: true
        },
    },
    {
        sequelize: db,
        tableName: 'orders'
    }
);

export default Orders;
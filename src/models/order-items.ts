import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    NonAttribute
} from 'sequelize';
import db from "../utils/db";
import Orders from "./orders";
import Products from "./products";

class OrderItems extends Model<InferAttributes<OrderItems>, InferCreationAttributes<OrderItems>> {
    declare id: CreationOptional<number>;
    declare quantity: number;
    declare orderId: ForeignKey<Orders['id']>;
    declare createdAt: CreationOptional<number>;
    declare updatedAt: CreationOptional<number>;

    /**
     * belongsTo Association
     */
    declare Product?: NonAttribute<Products>;
}

OrderItems.init(
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
        sequelize: db,
        tableName: 'order-items'
    }
);

export default OrderItems;
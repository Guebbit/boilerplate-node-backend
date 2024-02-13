import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey
} from 'sequelize';
import db from "../utils/db";
import Orders from "./orders";

class OrderItems extends Model<InferAttributes<OrderItems>, InferCreationAttributes<OrderItems>> {
    declare id: CreationOptional<number>;
    declare quantity: number;
    declare orderId: ForeignKey<Orders['id']>;
    declare createdAt: CreationOptional<number>;
    declare updatedAt: CreationOptional<number>;
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
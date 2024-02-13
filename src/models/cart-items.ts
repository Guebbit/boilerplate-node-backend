import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey
} from 'sequelize';
import db from "../utils/db";

class CartItems extends Model<InferAttributes<CartItems>, InferCreationAttributes<CartItems>> {
    declare id: CreationOptional<number>;
    declare quantity: number;
    // declare userId: ForeignKey<User['id']>;
    // declare createdAt: CreationOptional<number>;
    // declare updatedAt: CreationOptional<number>;
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
        // createdAt: {
        //     type: DataTypes.DATE,
        //     allowNull: false,
        //     defaultValue: DataTypes.NOW
        // },
        // updatedAt: DataTypes.DATE,
    },
    {
        sequelize: db,
        tableName: 'cart-items'
    }
);

export default CartItems;
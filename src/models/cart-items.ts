import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '@utils/database';

export class CartItemModel extends Model<
    InferAttributes<CartItemModel>,
    InferCreationAttributes<CartItemModel>
> {
    declare id: number;
    declare userId: number;
    declare productId: number;
    declare quantity: number;
    declare createdAt: Date;
    declare updatedAt: Date;
}

CartItemModel.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    },
    {
        sequelize,
        tableName: 'cart_items',
        modelName: 'CartItem',
        timestamps: true,
        indexes: [
            { unique: true, fields: ['userId', 'productId'] },
            { fields: ['userId'] },
            { fields: ['productId'] }
        ]
    }
);

export const cartItemModel = CartItemModel;

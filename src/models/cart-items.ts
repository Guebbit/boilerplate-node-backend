import { DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '@utils/database';

export class CartItemModel extends Model<
    InferAttributes<CartItemModel, { omit: 'createdAt' | 'updatedAt' }>,
    InferCreationAttributes<CartItemModel, { omit: 'createdAt' | 'updatedAt' }>
> {
    declare id: number;
    declare userId: ForeignKey<number>;
    declare productId: ForeignKey<number>;
    declare quantity: number;
    declare createdAt: Date;
    declare updatedAt: Date;
}

CartItemModel.init(
    {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        productId: { type: DataTypes.INTEGER, allowNull: false },
        quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }
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

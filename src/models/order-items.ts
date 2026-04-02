import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '@utils/database';

export class OrderItemModel extends Model<
    InferAttributes<OrderItemModel>,
    InferCreationAttributes<OrderItemModel>
> {
    declare id: number;
    declare orderId: number;
    declare productId: number | null;
    declare quantity: number;
    declare productTitle: string;
    declare productPrice: number;
    declare productDescription: string;
    declare productImageUrl: string;
    declare productActive: boolean;
    declare createdAt: Date;
    declare updatedAt: Date;
}

OrderItemModel.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        productTitle: { type: DataTypes.STRING, allowNull: false },
        productPrice: { type: DataTypes.FLOAT, allowNull: false },
        productDescription: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
        productImageUrl: { type: DataTypes.STRING, allowNull: false },
        productActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    },
    {
        sequelize,
        tableName: 'order_items',
        modelName: 'OrderItem',
        timestamps: true,
        indexes: [{ fields: ['orderId'] }, { fields: ['productId'] }]
    }
);

export const orderItemModel = OrderItemModel;

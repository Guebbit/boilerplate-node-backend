import { DataTypes, ForeignKey, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { sequelize } from '@utils/database';

export class OrderItemModel extends Model<
    InferAttributes<OrderItemModel, { omit: 'createdAt' | 'updatedAt' }>,
    InferCreationAttributes<OrderItemModel, { omit: 'createdAt' | 'updatedAt' }>
> {
    declare id: number;
    declare orderId: ForeignKey<number>;
    declare productId: ForeignKey<number | null>;
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
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        orderId: { type: DataTypes.INTEGER, allowNull: false },
        productId: { type: DataTypes.INTEGER, allowNull: true },
        quantity: { type: DataTypes.INTEGER, allowNull: false },
        productTitle: { type: DataTypes.STRING, allowNull: false },
        productPrice: { type: DataTypes.FLOAT, allowNull: false },
        productDescription: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
        productImageUrl: { type: DataTypes.STRING, allowNull: false },
        productActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
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

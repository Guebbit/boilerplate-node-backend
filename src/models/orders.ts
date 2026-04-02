import { DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import type { Order, Product } from '@types';
import { sequelize } from '@utils/database';

export enum EOrderStatus {
    PENDING = 'pending',
    PAID = 'paid',
    PROCESSING = 'processing',
    SHIPPED = 'shipped',
    DELIVERED = 'delivered',
    CANCELLED = 'cancelled'
}

export interface IOrderProduct {
    product: Product;
    quantity: number;
}

export class OrderModel extends Model<InferAttributes<OrderModel>, InferCreationAttributes<OrderModel>> {
    declare id: number;
    declare userId: number;
    declare email: string;
    declare status: EOrderStatus;
    declare notes: string | null;
    declare createdAt: Date;
    declare updatedAt: Date;

    declare products?: IOrderProduct[];

    get _id() {
        return this.id;
    }

    toObject() {
        return this.get({ plain: true });
    }
}

OrderModel.init(
    {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false },
        status: {
            type: DataTypes.ENUM(...Object.values(EOrderStatus)),
            allowNull: false,
            defaultValue: EOrderStatus.PENDING
        },
        notes: { type: DataTypes.TEXT, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    },
    {
        sequelize,
        modelName: 'Order',
        tableName: 'orders',
        timestamps: true,
        indexes: [{ fields: ['userId'] }, { fields: ['email'] }, { fields: ['createdAt'] }]
    }
);

export interface IOrderDocument extends Omit<Order, 'id' | 'userId' | 'items' | 'status' | 'total'> {
    id: number;
    _id?: number;
    userId: number;
    products: IOrderProduct[];
    status: EOrderStatus;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type IOrderModel = typeof OrderModel;

export const orderModel = OrderModel;

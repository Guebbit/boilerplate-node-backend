import { DataTypes, Model } from 'sequelize';
import { sequelize } from '@utils/database';
import { Order } from '@types';
import type { OrderProduct, OrderProductSnapshot } from '@types';

export type EOrderStatus = Order.StatusEnum;

const orderStatusValues: EOrderStatus[] = [
    Order.StatusEnum.Pending,
    Order.StatusEnum.Paid,
    Order.StatusEnum.Processing,
    Order.StatusEnum.Shipped,
    Order.StatusEnum.Delivered,
    Order.StatusEnum.Cancelled
];

export const EOrderStatus = {
    PENDING: Order.StatusEnum.Pending,
    PAID: Order.StatusEnum.Paid,
    PROCESSING: Order.StatusEnum.Processing,
    SHIPPED: Order.StatusEnum.Shipped,
    DELIVERED: Order.StatusEnum.Delivered,
    CANCELLED: Order.StatusEnum.Cancelled
} as const;

export type IOrderProductSnapshot = Omit<OrderProductSnapshot, 'id'> & {
    id?: string | number;
    [key: string]: unknown;
};

export type IOrderProduct = Omit<OrderProduct, 'product'> & { product: IOrderProductSnapshot };

export class OrderModel extends Model {
    declare id: number;
    declare userId: number;
    declare email: string;
    declare status: EOrderStatus;
    declare notes: string | null;
    declare createdAt: Date;
    declare updatedAt: Date;

    /**
     * Convenience property used by repository hydration to emulate legacy shape.
     * Order items are persisted in `order_items`; this array exists when items are loaded/joined.
     */
    declare products?: IOrderProduct[];

    toObject() {
        return this.get({ plain: true });
    }
}

OrderModel.init(
    {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false },
        status: {
            type: DataTypes.ENUM(...orderStatusValues),
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

export type IOrderDocument = Omit<
    Order,
    'id' | 'userId' | 'products' | 'status' | 'createdAt' | 'updatedAt'
> & {
    id: number;
    userId: number;
    products: IOrderProduct[];
    status: EOrderStatus;
    createdAt: Date;
    updatedAt: Date;
};

export type IOrderModel = typeof OrderModel;

export const orderModel = OrderModel;

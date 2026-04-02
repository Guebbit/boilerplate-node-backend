import { DataTypes, Model } from 'sequelize';
import { sequelize } from '@utils/database';
import type { CartItem, Order } from '@types';

export const EOrderStatus = {
    PENDING: 'pending',
    PAID: 'paid',
    PROCESSING: 'processing',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled'
} as const;
export type EOrderStatus = Order.StatusEnum;

export interface IOrderProduct extends Omit<CartItem, 'productId'> {
    product: {
        id?: string | number;
        title?: string;
        price?: number;
        description?: string;
        imageUrl?: string;
        active?: boolean;
        [key: string]: unknown;
    };
    quantity: number;
}

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

export interface IOrderDocument {
    id: number; // OpenAPI `Order.id` is string, runtime DB uses numeric IDs
    userId: number; // OpenAPI `Order.userId` is string, runtime DB uses numeric IDs
    email: Order['email'];
    products: IOrderProduct[];
    status: EOrderStatus;
    notes?: Order['notes'];
    createdAt: Date;
    updatedAt: Date;
}

export type IOrderModel = typeof OrderModel;

export const orderModel = OrderModel;

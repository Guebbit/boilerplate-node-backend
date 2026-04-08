import { CreationOptional, DataTypes, ForeignKey, Model } from 'sequelize';
import { sequelize } from '@utils/database';
import type { Order, OrderItem, Product } from '@types';

export const ORDER_STATUS = {
    PENDING: 'pending',
    PAID: 'paid',
    PROCESSING: 'processing',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled'
} as const;
export type EOrderStatus = `${Order.StatusEnum}`;

type IOrderProductSnapshot = Omit<Product, 'id'> & { id?: string };

export interface IOrderProduct extends Omit<OrderItem, 'product'> {
    product: IOrderProductSnapshot;
}

export class OrderModel extends Model {
    declare id: CreationOptional<number>;
    declare userId: ForeignKey<number>;
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

    /**
     * Handles to object.
     */
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
            type: DataTypes.ENUM(...Object.values(ORDER_STATUS)),
            allowNull: false,
            defaultValue: ORDER_STATUS.PENDING
        },
        notes: { type: DataTypes.TEXT, allowNull: true }
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
    // OpenAPI models transport ids as strings, while Sequelize persists numeric ids;
    // conversion is handled in services/repositories at the API boundary.
    id: number;
    userId: number;
    email: Order['email'];
    products: IOrderProduct[];
    status: EOrderStatus;
    notes?: Order['notes'];
    createdAt: Date;
    updatedAt: Date;
}

export type IOrderModel = typeof OrderModel;

export const orderModel = OrderModel;

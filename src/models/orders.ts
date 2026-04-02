import { DataTypes, Model } from 'sequelize';
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
    id: number;
    userId: number;
    email: string;
    products: IOrderProduct[];
    status: EOrderStatus;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type IOrderModel = typeof OrderModel;

export const orderModel = OrderModel;

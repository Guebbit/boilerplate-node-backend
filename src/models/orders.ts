import { DataTypes, Model } from 'sequelize';
import type { InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import { sequelize } from "@utils/database";
import { UserModel } from "./users";
import type { Order } from "@api/api";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Snapshot of product data stored on each order line.
 * Same as an embedded document in the MongoDB version —
 * the product data is captured at order-creation time so that
 * later changes to the Product table do not affect existing orders.
 */
export interface IOrderProductSnapshot {
    id?: number | null;
    title: string;
    price: number;
    imageUrl: string;
    description?: string;
    active?: boolean;
}

/**
 * Same as ICartItem in ./users.ts,
 * but instead of only productId I store the entire product snapshot.
 * If the product data change, it must not change for the order.
 */
export interface IOrderProduct {
    product: IOrderProductSnapshot;
    quantity: number;
}

// ---------------------------------------------------------------------------
// OrderItem model
// ---------------------------------------------------------------------------

/**
 * OrderItem Sequelize Model.
 * Stores a snapshot of each product purchased in an order.
 * One-to-many with Order (orderId FK).
 */
export class OrderItemModel
    extends Model<InferAttributes<OrderItemModel>, InferCreationAttributes<OrderItemModel>>
{
    declare id: CreationOptional<number>;
    declare orderId: number;
    declare quantity: number;
    // Product snapshot fields
    declare productId: CreationOptional<number | null>;
    declare productTitle: string;
    declare productPrice: number;
    declare productImageUrl: string;
    declare productDescription: CreationOptional<string>;
    declare productActive: CreationOptional<boolean>;
}

OrderItemModel.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        orderId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        quantity: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        // Product snapshot
        productId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        productTitle: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        productPrice: {
            type: DataTypes.FLOAT,
            allowNull: false,
        },
        productImageUrl: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        productDescription: {
            type: DataTypes.TEXT,
            defaultValue: '',
        },
        productActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    },
    {
        sequelize,
        tableName: 'order_items',
        timestamps: false,
    },
);

// ---------------------------------------------------------------------------
// Order model
// ---------------------------------------------------------------------------

/**
 * Order Sequelize Model.
 * Business logic (search, getAll) is handled by the
 * service layer (src/services/orders.ts) and repository layer
 * (src/repositories/orders.ts).
 *
 * Intentionally overrides the API-generated Order type's 'userId' (number vs string)
 * and 'items' (renamed to 'orderItems' in Sequelize) so that the
 * schema definition and the TypeScript types stay in sync.
 */
export class OrderModel
    extends Model<InferAttributes<OrderModel>, InferCreationAttributes<OrderModel>>
{
    declare id: CreationOptional<number>;
    declare userId: number;
    declare email: string;
    declare readonly createdAt: CreationOptional<Date>;
    declare readonly updatedAt: CreationOptional<Date>;

    // Populated by associations
    declare orderItems?: OrderItemModel[];
}

OrderModel.init(
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize,
        tableName: 'orders',
        timestamps: true,
    },
);

// ---------------------------------------------------------------------------
// Associations
// ---------------------------------------------------------------------------

OrderModel.hasMany(OrderItemModel, { foreignKey: 'orderId', as: 'orderItems' });
OrderItemModel.belongsTo(OrderModel, { foreignKey: 'orderId' });

UserModel.hasMany(OrderModel, { foreignKey: 'userId' });
OrderModel.belongsTo(UserModel, { foreignKey: 'userId' });

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

/** Full Sequelize model instance (replaces Mongoose IOrderDocument) */
export type IOrderDocument = OrderModel;

// Re-export for compatibility
export type { Order };

export default OrderModel;
import { Table, Column, Model, DataType, CreatedAt, UpdatedAt } from 'sequelize-typescript';

/**
 * OrderItem interface
 * Instead of only productId, store the entire product data.
 * If the product data changes, it must not change for the order.
 */
export interface IOrderItem {
    id?: number;
    orderId: number;
    productId: number;
    title: string;
    price: number;
    description?: string;
    imageUrl?: string;
    quantity: number;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * OrderItem Model
 * Stores a snapshot of product data at the time of order
 */
@Table({
    tableName: 'order_items',
    timestamps: true,
})
export class OrderItemModel extends Model<IOrderItem> {
    @Column({
        type: DataType.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    })
    declare id: number;

    @Column({
        type: DataType.INTEGER.UNSIGNED,
        allowNull: false,
    })
    declare orderId: number;

    @Column({
        type: DataType.INTEGER.UNSIGNED,
        allowNull: false,
    })
    declare productId: number;

    @Column({
        type: DataType.STRING(255),
        allowNull: false,
    })
    declare title: string;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
    })
    declare price: number;

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
    declare description?: string;

    @Column({
        type: DataType.STRING(500),
        allowNull: true,
    })
    declare imageUrl?: string;

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
    })
    declare quantity: number;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;
}

export default OrderItemModel;

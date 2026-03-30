import { Table, Column, Model, DataType, CreatedAt, UpdatedAt, HasMany } from 'sequelize-typescript';
import type { Order } from "@api/api"
import OrderItemModel from './order-items';
export type { IOrderItem } from './order-items';
export { OrderItemModel } from './order-items';

/**
 * Order interface
 */
export interface IOrder extends Omit<Order, 'id' | 'userId' | 'items'> {
    id?: number;
    userId: number;
    email: string;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * Order Model
 */
@Table({
    tableName: 'orders',
    timestamps: true,
})
export class OrderModel extends Model<IOrder> {
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
    declare userId: number;

    @Column({
        type: DataType.STRING(255),
        allowNull: false,
        validate: {
            isEmail: true,
        },
    })
    declare email: string;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;

    @HasMany(() => OrderItemModel, 'orderId')
    declare orderItems?: OrderItemModel[];
}

export default OrderModel;

import { Table, Column, Model, DataType, CreatedAt, UpdatedAt } from 'sequelize-typescript';

/**
 * Cart Item interface
 * Reference to product and quantity
 */
export interface ICartItem {
    id?: number;
    userId: number;
    productId: number;
    quantity: number;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * CartItem Model
 */
@Table({
    tableName: 'cart_items',
    timestamps: true,
})
export class CartItemModel extends Model<ICartItem> {
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
        type: DataType.INTEGER.UNSIGNED,
        allowNull: false,
    })
    declare productId: number;

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

export default CartItemModel;

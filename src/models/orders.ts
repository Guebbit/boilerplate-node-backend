import mongoose, { Schema, Document } from 'mongoose';
import Users, { IUser } from './users'; // Assuming you have a Users model defined
import Products, { IProduct } from './products'; // Assuming you have a Products model defined
import OrderItems, { IOrderItem } from './order-items'; // Assuming you have a OrderItems model defined

export interface IOrder extends Document {
    userId: IUser['_id'];
    createdAt: Date;
    updatedAt?: Date;
    // You may need to adjust the types for products and order items
    products: Array<IProduct['_id']>;
    orderItems: Array<IOrderItem['_id']>;
}

export const orderSchema = new Schema<IOrder>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'Users',
            required: true
        },
        // createdAt: {
        //     type: Date,
        //     default: Date.now,
        //     required: true
        // },
        // updatedAt: {
        //     type: Date
        // },
        // Define the reference to the Products model
        products: [{
            type: Schema.Types.ObjectId,
            ref: 'Products'
        }],
        // Define the reference to the OrderItems model
        orderItems: [{
            type: Schema.Types.ObjectId,
            ref: 'OrderItems'
        }]
    },
    {
        timestamps: true
    }
);

export default mongoose.model<IOrder>('Orders', orderSchema);
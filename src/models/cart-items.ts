import mongoose, { Schema, Document } from 'mongoose';
import Orders, { IOrder } from './orders'; // Assuming you have an Orders model defined

export interface IOrderItem extends Document {
    quantity: number;
    orderId: IOrder['_id'];
    createdAt: Date;
    updatedAt?: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
    {
        quantity: { type: Number, required: true },
        orderId: { type: Schema.Types.ObjectId, ref: 'Orders', required: true },
        createdAt: { type: Date, default: Date.now, required: true },
        updatedAt: { type: Date }
    },
    { timestamps: true }
);

const OrderItems = mongoose.model<IOrderItem>('OrderItems', orderItemSchema);

export default OrderItems;
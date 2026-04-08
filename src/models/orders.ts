import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { productSchema } from './products';
import type { Order } from '@types';

/**
 * Valid order status values (mirrors the OpenAPI enum).
 */
export enum EOrderStatus {
    PENDING = 'pending',
    PAID = 'paid',
    PROCESSING = 'processing',
    SHIPPED = 'shipped',
    DELIVERED = 'delivered',
    CANCELLED = 'cancelled'
}

/**
 * Order Document interface.
 * Intentionally overrides the API-generated Order type's 'userId' (ObjectId vs string)
 * and keeps `items` as embedded OrderItem snapshots in the schema.
 */
export interface IOrderDocument
    extends Omit<Order, 'id' | 'userId' | 'status' | 'total'>, Document {
    userId: Types.ObjectId;
    status: EOrderStatus;
    notes?: string;
}

/**
 * Order Document model type.
 * Business logic (search, getAll) is now handled by the
 * service layer (src/services/orders.ts) and repository layer
 * (src/repositories/orders.ts).
 */
export type IOrderModel = Model<IOrderDocument, unknown, unknown>;

/**
 * Mongoose schema for persisted order documents.
 */
export const orderSchema = new Schema<IOrderDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            required: true
        },
        email: {
            type: String,
            required: true
        },
        items: [
            {
                product: productSchema,
                quantity: {
                    type: Number,
                    required: true
                }
            }
        ],
        status: {
            type: String,
            enum: Object.values(EOrderStatus),
            default: EOrderStatus.PENDING
        },
        notes: {
            type: String
        }
    },
    {
        // Automatically manages createdAt and updatedAt timestamps
        timestamps: true
    }
);

/**
 * Mongoose model for order CRUD operations.
 */
export const orderModel = model<IOrderDocument, IOrderModel>('Order', orderSchema);

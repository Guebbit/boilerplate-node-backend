import mongoose, { Schema, Document } from 'mongoose';
import { z } from 'zod';
// import CartItems, { ICartItem } from './cart-items'; // Assuming you have a CartItems model defined

export interface IProduct extends Document {
    title: string;
    price: number;
    imageUrl: string;
    description: string;
    active: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
}

const productSchema = new Schema<IProduct>(
    {
        title: {
            type: String, required: true
        },
        price: {
            type: Number, required: true
        },
        imageUrl: {
            type: String, required: true
        },
        description: {
            type: String, required: true
        },
        active: {
            type: Boolean, default: true
        },
        deletedAt: { type: Date }
    },
    { timestamps: true }
);

export const ProductZodSchema =
    z.object({
        id: z.number().nullish().optional(),
        title: z
            .string({
                required_error: "Title is required",
            })
            .min(5, "Title is too short"),
        price: z.number(),
        imageUrl: z
            .string({
                required_error: "Image is required",
            }),
        createdAt: z.date().nullish().optional(),
        updatedAt: z.date().nullish().optional(),
    });

export default mongoose.model<IProduct>('Products', productSchema);

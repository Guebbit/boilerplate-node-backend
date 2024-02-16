import mongoose, { Schema, Document } from 'mongoose';
import { z } from 'zod';
import Cart, { ICart } from './cart'; // Assuming you have a Cart model defined
import Orders, { IOrder } from './orders'; // Assuming you have an Orders model defined
import Tokens, { IToken } from './tokens'; // Assuming you have a Tokens model defined
import Products, { IProduct } from './products'; // Assuming you have a Products model defined
import CartItems, { ICartItem } from './cart-items'; // Assuming you have a CartItems model defined

export interface IUser extends Document {
    email: string;
    username: string;
    password: string;
    imageUrl?: string;
    admin?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;

    // Associations
    cart: ICart['_id'];
    orders: Array<IOrder['_id']>;
    tokens: Array<IToken['_id']>;

    // Custom methods
    addToCart: (product: IProduct, quantity?: number) => Promise<unknown>;
}

const userSchema = new Schema<IUser>(
    {
        email: { type: String, required: true },
        username: { type: String, required: true },
        password: { type: String, required: true },
        imageUrl: { type: String },
        admin: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date },
        deletedAt: { type: Date },

        // Associations
        cart: { type: Schema.Types.ObjectId, ref: 'Cart' },
        orders: [{ type: Schema.Types.ObjectId, ref: 'Orders' }],
        tokens: [{ type: Schema.Types.ObjectId, ref: 'Tokens' }]
    },
    { timestamps: true }
);

userSchema.methods.addToCart = async function(product: IProduct, quantity: number = 0) {
    if (!product) return Promise.reject([]);

    try {
        const cart = await Cart.findOne({ user: this._id }).exec();
        if (!cart) return Promise.reject('Cart not found');

        const cartItem = await CartItems.findOne({ cart: cart._id, product: product._id }).exec();
        if (cartItem) {
            cartItem.quantity += quantity;
            await cartItem.save();
        } else {
            await CartItems.create({ cart: cart._id, product: product._id, quantity });
        }
        return Promise.resolve();
    } catch (error) {
        return Promise.reject(error);
    }
};

const Users = mongoose.model<IUser>('Users', userSchema);

export const UserSchema = z.object({
    email: z.string().email('Not a valid email').nonempty('Email is required'),
    username: z.string().min(3, 'Username is too short').nonempty('Username is required'),
    password: z.string().min(8, 'Password is too short').nonempty('Password is required'),
    imageUrl: z.string().optional(),
    admin: z.boolean().optional(),
    createdAt: z.date().nullable(),
    updatedAt: z.date().nullable(),
});

export default Users;
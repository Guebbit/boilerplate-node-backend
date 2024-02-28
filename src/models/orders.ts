import {type CastError, model, Schema, Types} from 'mongoose';
import type { Document, Model, PipelineStage } from 'mongoose';
import { productSchema, type IProduct } from "./products";

/**
 * Same as ICartItem in ./users.ts,
 * but instead of only productId I store the entire product data.
 * If the product data change, it must not change for the order.
 */
export interface IOrderProduct {
    product: IProduct;
    quantity: number;
}

export interface IOrder {
    userId: Types.ObjectId;
    email: string;
    products: IOrderProduct[];
    createdAt: Date;
}

export interface IOrderDocument extends IOrder, Document {}

/**
 * Statics
 */
export interface IOrderModel extends Model<IOrderDocument, {}, {}> {
    getAll: (pipeline: PipelineStage[]) => Promise<IOrderDocument[]>
}


export const orderSchema = new Schema<IOrderDocument>({
    userId: {
        type: Schema.Types.ObjectId,
        required: true,
    },
    email: {
        type: String,
        required: true
    },
    products: [{
        product: productSchema,
        quantity: {
            type: Number,
            required: true
        }
    }],
    // only createdAt, without updatedAt
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

/**
 * Get all orders
 * Only admin can see other people orders
 *
 * Add total quantity, total items and total price
 *
 * @param id
 * @param admin
 */
orderSchema.static('getAll', async function(pipeline: PipelineStage[] = []){
    return this.aggregate([
        ...pipeline,
        {
            $addFields: {
                // Count all OrderItems
                totalItems: {
                    $size: "$products"
                },
                // Sum quantities from all OrderItems
                totalQuantity: {
                    $sum: "$products.quantity"
                },
                // Sum of all prices multiplied for quantity
                totalPrice: {
                    $sum: {
                        $map: {
                            input: "$products",
                            as: "product",
                            in: {
                                $multiply: ["$$product.product.price", "$$product.quantity"]
                            }
                        }
                    }
                },
            }
        }
    ])
    .catch((error: CastError) => {
        console.log("ERRORRRRRRRRRRRRRRRRRRRR", error)
    });
});

export default model<IOrderDocument, IOrderModel>('Order', orderSchema);
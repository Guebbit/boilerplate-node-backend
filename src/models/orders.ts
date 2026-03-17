import { model, type QueryFilter, Schema, Types } from 'mongoose';
import type { Document, Model, PipelineStage } from 'mongoose';
import { productSchema } from "./products";
import type { SearchOrdersRequest, OrdersResponse, Order, Product } from "@api/api"

/**
 * Same as ICartItem in ./users.ts,
 * but instead of only productId I store the entire product data.
 * If the product data change, it must not change for the order.
 */
export interface IOrderProduct {
    product: Product;
    quantity: number;
}

/**
 * Order Document interface
 */
export interface IOrderDocument extends Order, Document {}

/**
 * Order Document static methods
 */
export interface IOrderModel extends Model<IOrderDocument, unknown, unknown> {
    getAll: (pipeline: PipelineStage[]) => Promise<IOrderDocument[]>;
    search: (search: SearchOrdersRequest,  scope?: QueryFilter<IOrderDocument>) => Promise<OrdersResponse>;
}

/**
 *
 */
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
 * @param pipeline
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
});

/**
 * Search orders (DTO-friendly) — matches POST /orders/search in OpenAPI
 *
 * Filters: id, userId, productId, email
 * Pagination: page (1-based), pageSize
 *
 * Note on productId:
 * In this schema product data is embedded: products[].product.
 * We filter by products.product._id (or products.product.id if your productSchema uses that).
 */
orderSchema.static('search', async function(search: SearchOrdersRequest = {}): Promise<OrdersResponse> {
    const page = Math.max(1, Number(search.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(search.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    const match: Record<string, unknown> = {};

    if (search.id && String(search.id).trim() !== "") {
        match._id = new Types.ObjectId(String(search.id));
    }

    if (search.userId && String(search.userId).trim() !== "") {
        match.userId = new Types.ObjectId(String(search.userId));
    }

    if (search.email && String(search.email).trim() !== "") {
        match.email = String(search.email).trim();
    }

    if (search.productId && String(search.productId).trim() !== "") {
        // Assumes productSchema uses default _id. If you store product.id instead, change to "products.product.id".
        match["products.product._id"] = new Types.ObjectId(String(search.productId));
    }

    const basePipeline: PipelineStage[] = [
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
            $addFields: {
                totalItems: { $size: "$products" },
                totalQuantity: { $sum: "$products.quantity" },
                totalPrice: {
                    $sum: {
                        $map: {
                            input: "$products",
                            as: "product",
                            in: { $multiply: ["$$product.product.price", "$$product.quantity"] }
                        }
                    }
                },
            }
        },
    ];

    const [countAgg] = await this.aggregate([
        ...basePipeline,
        { $count: "totalItems" }
    ]);

    const totalItems = countAgg?.totalItems ?? 0;
    const totalPages = Math.ceil(totalItems / pageSize);

    const items = await this.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: pageSize }
    ]);

    return {
        items,
        meta: {
            page,
            pageSize,
            totalItems,
            totalPages,
        }
    };
});

export default model<IOrderDocument, IOrderModel>('Order', orderSchema);
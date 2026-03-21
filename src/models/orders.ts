import {
    Model,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    CreationOptional,
    ForeignKey,
    BelongsToManyAddAssociationMixin,
    BelongsToManyGetAssociationsMixin,
    NonAttribute,
    WhereOptions,
    FindAndCountOptions
} from 'sequelize';
import database from "../utils/database";
import Users from "./users";
import Products from "./products";
import OrderItems from "./order-items";
import { SearchOrdersRequest, OrdersResponse } from "@api/api"

// export type OrderDetailsType = Orders & {
//     UserId: string,
//     totalItems: number,
//     totalQuantity: string,
//     totalPrice: number
//     products: Array<Orders & {
//         'OrderItems.quantity': number,
//         'OrderItems.Product.title': string,
//         'OrderItems.Product.description': string,
//         'OrderItems.Product.price': number,
//         'OrderItems.Product.imageUrl': string,
//     }>
// };

export type IOrdersExtended = Orders & {
    totalItems: number
    totalQuantity: number
    totalPrice: number
};

class Orders extends Model<InferAttributes<Orders>, InferCreationAttributes<Orders>> {
    declare id: CreationOptional<number>;
    // redundant with user email, because some data should remain in the order, untouched
    declare email: string;
    declare UserId: ForeignKey<Users['id']>;
    declare createdAt: CreationOptional<number>;

    /**
     * BelongsToMany Association (through CartItem) - Products
     */
    declare addProduct: BelongsToManyAddAssociationMixin<Products, Products['id']>;
    declare getProducts: BelongsToManyGetAssociationsMixin<Products>;

    /**
     * BelongsToMany Association (through CartItem) - Products
     */
    declare OrderItems?: NonAttribute<OrderItems[]>;
    declare getOrderItems: BelongsToManyGetAssociationsMixin<OrderItems>;

    /**
     * Get all orders
     * Only admin can see other people orders
     *
     * Add total quantity, total items and total price
     *
     * @param userId - * = all orders, otherwise is target user
     * @param orderId - empty = all orders, otherwise get order by ID
     */
    static async getAll(userId: string | number = "", orderId = "") {
        const where: WhereOptions = {};
        // admin can search by *, all users
        if (userId !== "*")
            where.UserId = userId;
        if (orderId !== "")
            where.id = orderId;
        return Orders.findAll({
            where,
            include: [{
                model: OrderItems,
                include: [{
                    model: Products,
                }],
            }],
        })
            .then((orders) =>
                orders.map(order => {
                    return {
                        ...order,
                        totalItems: order.OrderItems!.length,
                        totalQuantity: order.OrderItems!
                            .reduce((tot, { quantity }) => tot + quantity, 0),
                        totalPrice: order.OrderItems!
                            .reduce((sum, { quantity, Product }) => sum + (quantity * (Product?.price ?? 0)), 0),
                    };
                }) as IOrdersExtended[]
            )
    }

    /**
     * Search orders (DTO-friendly) — matches POST /orders/search in OpenAPI
     *
     * Filters: id, userId, productId, email
     * Pagination: page (1-based), pageSize
     *
     * NOTE: productId filtering is applied by constraining the OrderItems include.
     */
    static async search(dto: SearchOrdersRequest = {}): Promise<OrdersResponse> {
        const page = Math.max(1, Number(dto.page ?? 1) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(dto.pageSize ?? 10) || 10));
        const offset = (page - 1) * pageSize;
        const limit = pageSize;

        const where: WhereOptions<InferAttributes<Orders>>[] = [];

        if (dto.id !== undefined && dto.id !== null && String(dto.id).trim() !== "") {
            where.id = dto.id;
        }

        if (dto.userId !== undefined && dto.userId !== null && String(dto.userId).trim() !== "") {
            where.UserId = dto.userId;
        }

        if (dto.email !== undefined && dto.email !== null && String(dto.email).trim() !== "") {
            where.email = String(dto.email).trim();
        }

        const include: FindAndCountOptions["include"] = [
            {
                model: OrderItems,
                required: dto.productId !== undefined && dto.productId !== null && String(dto.productId).trim() !== "",
                where: (dto.productId !== undefined && dto.productId !== null && String(dto.productId).trim() !== "")
                    ? { ProductId: dto.productId }
                    : undefined,
                include: [
                    {
                        model: Products,
                    }
                ]
            }
        ];

        // distinct: true avoids inflated counts caused by joins
        return Orders.findAndCountAll({
            where,
            include,
            distinct: true,
            order: [["createdAt", "DESC"]],
            limit,
            offset,
        })
            .then(({ rows, count }) => {
                const items = rows.map(order => {
                    return {
                        ...order,
                        totalItems: order.OrderItems?.length ?? 0,
                        totalQuantity: (order.OrderItems ?? [])
                            .reduce((tot, { quantity }) => tot + quantity, 0),
                        totalPrice: (order.OrderItems ?? [])
                            .reduce((sum, { quantity, Product }) => sum + (quantity * (Product?.price ?? 0)), 0),
                    };
                }) as IOrdersExtended[];

                return {
                    items,
                    meta: {
                        page,
                        pageSize,
                        totalItems: count,
                        totalPages: Math.ceil(count / pageSize),
                    }
                };
            });
    }
}

Orders.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            allowNull: false,
            primaryKey: true
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
    },
    {
        sequelize: database,
        tableName: 'orders'
    }
);

export default Orders;
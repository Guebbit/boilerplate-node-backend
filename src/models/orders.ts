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
    WhereOptions
} from 'sequelize';
import db from "../utils/db";
import Users from "./users";
import Products from "./products";
import OrderItems from "./order-items";

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
     * TODO separare o cmq fare in modo di poter ottenere le seguenti varianti:
     *  - tutti gli utenti
     *  - tutti gli ordini
     *  - solo l'utente orderId
     *  - solo l'ordine userId
     *
     * @param userId
     * @param orderId
     */
    static async getAll(userId = "", orderId = ""){
        const where: WhereOptions = {};
        // admin can search by *, all users
        if(userId !== "*")
            where.UserId = userId;
        if(orderId !== "")
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
                            .reduce((sum, { quantity, Product }) => sum + (quantity * (Product?.price || 0)), 0),
                    };
                }) as IOrdersExtended[]
            )
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
        sequelize: db,
        tableName: 'orders'
    }
);

export default Orders;
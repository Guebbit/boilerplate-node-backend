import { userModel } from './users';
import { productModel } from './products';
import { orderModel } from './orders';
import { cartItemModel } from './cart-items';
import { userTokenModel } from './user-tokens';
import { orderItemModel } from './order-items';

/**
 * USER ↔ CART ITEMS
 * One user can have many items in their cart
 * Each cart item belongs to a single user
 * If a user is deleted → their cart items are deleted too
 */
userModel.hasMany(cartItemModel, {
    foreignKey: 'userId',
    as: 'cartItems',
    onDelete: 'CASCADE'
});
cartItemModel.belongsTo(userModel, {
    foreignKey: 'userId',
    as: 'user'
});

/**
 * PRODUCT ↔ CART ITEMS
 * One product can appear in many cart entries
 * Each cart item references a single product
 * If a product is deleted → related cart entries are deleted
 */
productModel.hasMany(cartItemModel, {
    foreignKey: 'productId',
    as: 'cartEntries',
    onDelete: 'CASCADE'
});
cartItemModel.belongsTo(productModel, {
    foreignKey: 'productId',
    as: 'product'
});

/**
 * USER ↔ TOKENS
 * One user can have multiple auth/session tokens
 * Each token belongs to a single user
 * If a user is deleted → tokens are removed
 */
userModel.hasMany(userTokenModel, {
    foreignKey: 'userId',
    as: 'tokens',
    onDelete: 'CASCADE'
});
userTokenModel.belongsTo(userModel, {
    foreignKey: 'userId',
    as: 'user'
});

/**
 * USER ↔ ORDERS
 * One user can place many orders
 * Each order belongs to a single user
 * If a user is deleted → orders are deleted
 */
userModel.hasMany(orderModel, {
    foreignKey: 'userId',
    as: 'orders',
    onDelete: 'CASCADE'
});
orderModel.belongsTo(userModel, {
    foreignKey: 'userId',
    as: 'user'
});

/**
 * ORDER ↔ ORDER ITEMS
 * One order contains multiple items
 * Each order item belongs to one order
 * If an order is deleted → its items are deleted
 */
orderModel.hasMany(orderItemModel, {
    foreignKey: 'orderId',
    as: 'items',
    onDelete: 'CASCADE'
});
orderItemModel.belongsTo(orderModel, {
    foreignKey: 'orderId',
    as: 'order'
});

/**
 * PRODUCT ↔ ORDER ITEMS
 * One product can be referenced in many order items
 * Each order item points to a product (snapshot/reference)
 * No cascade delete here → preserves order history
 */
productModel.hasMany(orderItemModel, {
    foreignKey: 'productId',
    as: 'orderEntries'
});
orderItemModel.belongsTo(productModel, {
    foreignKey: 'productId',
    as: 'sourceProduct'
});

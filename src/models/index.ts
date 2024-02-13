import Users from "./users";
import Products from "./products";
import Cart from "./cart";
import CartItems from "./cart-items";
import Orders from "./orders";
import OrderItems from "./order-items";
import Tokens from "./tokens";

Users.hasOne(Cart);
Cart.belongsTo(Users);

Users.hasMany(Orders);
Orders.belongsTo(Users);

Cart.belongsToMany(Products, {
    through: CartItems
});
Cart.hasMany(CartItems);
CartItems.belongsTo(Cart);
CartItems.belongsTo(Products);

Orders.belongsToMany(Products, {
    through: OrderItems
});
Orders.hasMany(OrderItems);
OrderItems.belongsTo(Orders);
OrderItems.belongsTo(Products);

Users.hasMany(Tokens);
Tokens.belongsTo(Users);
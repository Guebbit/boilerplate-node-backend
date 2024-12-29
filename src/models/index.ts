import Users from "./users";
import Products from "./products";
import Carts from "./carts";
import CartItems from "./cart-items";
import Orders from "./orders";
import OrderItems from "./order-items";
import Tokens from "./tokens";

Users.hasOne(Carts);
Carts.belongsTo(Users);

Users.hasMany(Orders);
Orders.belongsTo(Users);

Carts.belongsToMany(Products, {
    through: CartItems
});
Carts.hasMany(CartItems);
CartItems.belongsTo(Carts);
CartItems.belongsTo(Products);
Products.hasMany(CartItems)

Orders.belongsToMany(Products, {
    through: OrderItems
});
Orders.hasMany(OrderItems);
OrderItems.belongsTo(Orders);
OrderItems.belongsTo(Products);

Users.hasMany(Tokens);
Tokens.belongsTo(Users);
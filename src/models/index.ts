export { default as Users } from "./users";
export { default as Products } from "./products";
export { default as Orders } from "./orders";
export { default as Tokens } from "./tokens";

// Users.hasOne(Cart);
// Cart.belongsTo(Users);
//
// Users.hasMany(Orders);
// Orders.belongsTo(Users);
//
// Cart.belongsToMany(Products, {
//     through: CartItems
// });
// Cart.hasMany(CartItems);
// CartItems.belongsTo(Cart);
// CartItems.belongsTo(Products);
//
// Orders.belongsToMany(Products, {
//     through: OrderItems
// });
// Orders.hasMany(OrderItems);
// OrderItems.belongsTo(Orders);
// OrderItems.belongsTo(Products);
//
// Users.hasMany(Tokens);
// Tokens.belongsTo(Users);
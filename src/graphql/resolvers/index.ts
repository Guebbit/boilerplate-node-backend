import productResolvers from './products';
import userResolvers from './users';
import orderResolvers from './orders';
import accountResolvers from './account';

/**
 * Combined resolvers map for graphql-yoga / graphql-js.
 */
const resolvers = {
    Query: {
        products: productResolvers.products,
        product: productResolvers.product,
        me: userResolvers.me,
        orders: orderResolvers.orders,
        order: orderResolvers.order,
        users: userResolvers.users,
        user: userResolvers.user,
    },
    Mutation: {
        login: accountResolvers.login,
        signup: accountResolvers.signup,
        createProduct: productResolvers.createProduct,
        updateProduct: productResolvers.updateProduct,
        deleteProduct: productResolvers.deleteProduct,
        createOrder: orderResolvers.createOrder,
        updateOrder: orderResolvers.updateOrder,
        deleteOrder: orderResolvers.deleteOrder,
        createUser: userResolvers.createUser,
        updateUser: userResolvers.updateUser,
        deleteUser: userResolvers.deleteUser,
    },
};

export default resolvers;

import { GraphQLError } from 'graphql';
import { Types } from 'mongoose';
import OrderService from '@services/orders';
import type { IGraphQLContext } from '../context';

/**
 * Order query resolvers.
 * - Admins see all orders.
 * - Authenticated users see only their own orders.
 */
const orderQueries = {
    orders: async (
        _parent: unknown,
        arguments_: {
            id?: string;
            page?: number;
            pageSize?: number;
            userId?: string;
            email?: string;
            productId?: string;
        },
        context: IGraphQLContext,
    ) => {
        if (!context.user)
            throw new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHORIZED' } });

        // Non-admins can only access their own orders
        const scope = context.user.admin
            ? {}
            : { userId: new Types.ObjectId((context.user._id as Types.ObjectId).toString()) };

        return OrderService.search(arguments_, scope as Record<string, unknown>);
    },

    order: async (
        _parent: unknown,
        { id }: { id: string },
        context: IGraphQLContext,
    ) => {
        if (!context.user)
            throw new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHORIZED' } });

        // Non-admins can only access their own orders
        const scope = context.user.admin
            ? undefined
            : { userId: new Types.ObjectId((context.user._id as Types.ObjectId).toString()) };

        const order = await OrderService.getById(id, scope as Record<string, unknown> | undefined);
        if (!order)
            throw new GraphQLError('Order not found', { extensions: { code: 'NOT_FOUND' } });

        return order;
    },
};

/**
 * Order mutation resolvers.
 */
const orderMutations = {
    createOrder: async (
        _parent: unknown,
        { items }: { items: { productId: string; quantity: number }[] },
        context: IGraphQLContext,
    ) => {
        if (!context.user)
            throw new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHORIZED' } });

        const userId = (context.user._id as Types.ObjectId).toString();
        const result = await OrderService.create(userId, context.user.email, items);

        if (!result.success)
            throw new GraphQLError(result.message, { extensions: { code: 'BAD_USER_INPUT' } });

        return result.data;
    },

    updateOrder: async (
        _parent: unknown,
        { id, ...data }: {
            id: string;
            status?: string;
            email?: string;
            userId?: string;
            items?: { productId: string; quantity: number }[];
        },
        context: IGraphQLContext,
    ) => {
        if (!context.user?.admin)
            throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });

        const result = await OrderService.update(id, data);
        if (!result.success)
            throw new GraphQLError(result.message, { extensions: { code: 'NOT_FOUND' } });

        return result.data;
    },

    deleteOrder: async (
        _parent: unknown,
        { id }: { id: string },
        context: IGraphQLContext,
    ) => {
        if (!context.user?.admin)
            throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });

        const result = await OrderService.remove(id);
        if (!result.success)
            throw new GraphQLError(result.message, { extensions: { code: 'NOT_FOUND' } });

        return true;
    },
};

export default { ...orderQueries, ...orderMutations };

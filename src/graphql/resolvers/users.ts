import { GraphQLError } from 'graphql';
import UserService from '@services/users';
import type { IGraphQLContext } from '../context';

/**
 * User query resolvers — admin only (except `me`).
 */
const userQueries = {
    me: (_parent: unknown, _arguments: unknown, context: IGraphQLContext) => {
        if (!context.user)
            throw new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHORIZED' } });
        return context.user.toObject();
    },

    users: async (
        _parent: unknown,
        arguments_: {
            id?: string;
            page?: number;
            pageSize?: number;
            text?: string;
            email?: string;
            username?: string;
            active?: boolean;
        },
        context: IGraphQLContext,
    ) => {
        if (!context.user?.admin)
            throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });

        return UserService.search(arguments_);
    },

    user: async (
        _parent: unknown,
        { id }: { id: string },
        context: IGraphQLContext,
    ) => {
        if (!context.user?.admin)
            throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });

        return UserService.getById(id);
    },
};

/**
 * User mutation resolvers — admin only.
 */
const userMutations = {
    createUser: async (
        _parent: unknown,
        arguments_: {
            email: string;
            username: string;
            password: string;
            admin?: boolean;
            imageUrl?: string;
        },
        context: IGraphQLContext,
    ) => {
        if (!context.user?.admin)
            throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });

        const errors = UserService.validateData(arguments_);
        if (errors.length > 0)
            throw new GraphQLError(errors.join(', '), { extensions: { code: 'BAD_USER_INPUT' } });

        const user = await UserService.adminCreate(arguments_);
        return user.toObject();
    },

    updateUser: async (
        _parent: unknown,
        { id, ...data }: {
            id: string;
            email?: string;
            username?: string;
            password?: string;
            admin?: boolean;
            imageUrl?: string;
        },
        context: IGraphQLContext,
    ) => {
        if (!context.user?.admin)
            throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });

        try {
            const user = await UserService.adminUpdate(id, data);
            return user.toObject();
        } catch (error) {
            const message = (error as Error).message;
            if (message === '404')
                throw new GraphQLError('User not found', { extensions: { code: 'NOT_FOUND' } });
            throw new GraphQLError(message, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
        }
    },

    deleteUser: async (
        _parent: unknown,
        { id, hardDelete = false }: { id: string; hardDelete?: boolean },
        context: IGraphQLContext,
    ) => {
        if (!context.user?.admin)
            throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });

        const result = await UserService.remove(id, hardDelete);
        if (!result.success)
            throw new GraphQLError(result.message, { extensions: { code: 'NOT_FOUND' } });

        return true;
    },
};

export default { ...userQueries, ...userMutations };

import { GraphQLError } from 'graphql';
import ProductService from '@services/products';
import type { IGraphQLContext } from '../context';

/**
 * Product query resolvers (read-only, public).
 */
const productQueries = {
    products: async (
        _parent: unknown,
        arguments_: {
            id?: string;
            page?: number;
            pageSize?: number;
            text?: string;
            minPrice?: number;
            maxPrice?: number;
        },
        context: IGraphQLContext,
    ) => {
        const admin = context.user?.admin === true;
        return ProductService.search(arguments_, admin);
    },

    product: async (
        _parent: unknown,
        { id }: { id: string },
        context: IGraphQLContext,
    ) => {
        const admin = context.user?.admin === true;
        return ProductService.getById(id, admin);
    },
};

/**
 * Product mutation resolvers (admin only).
 */
const productMutations = {
    createProduct: async (
        _parent: unknown,
        arguments_: {
            title: string;
            price: number;
            description?: string;
            imageUrl?: string;
            active?: boolean;
        },
        context: IGraphQLContext,
    ) => {
        if (!context.user?.admin)
            throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });

        const errors = ProductService.validateData(arguments_ as never);
        if (errors.length > 0)
            throw new GraphQLError(errors.join(', '), { extensions: { code: 'BAD_USER_INPUT' } });

        const product = await ProductService.create(arguments_ as never);
        return product.toObject();
    },

    updateProduct: async (
        _parent: unknown,
        { id, ...data }: {
            id: string;
            title?: string;
            price?: number;
            description?: string;
            imageUrl?: string;
            active?: boolean;
        },
        context: IGraphQLContext,
    ) => {
        if (!context.user?.admin)
            throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });

        try {
            const product = await ProductService.update(id, data as never);
            return product.toObject();
        } catch (error) {
            const message = (error as Error).message;
            if (message === '404')
                throw new GraphQLError('Product not found', { extensions: { code: 'NOT_FOUND' } });
            throw new GraphQLError(message, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
        }
    },

    deleteProduct: async (
        _parent: unknown,
        { id, hardDelete = false }: { id: string; hardDelete?: boolean },
        context: IGraphQLContext,
    ) => {
        if (!context.user?.admin)
            throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });

        const result = await ProductService.remove(id, hardDelete);
        if (!result.success)
            throw new GraphQLError(result.message, { extensions: { code: 'NOT_FOUND' } });

        return true;
    },
};

export default { ...productQueries, ...productMutations };

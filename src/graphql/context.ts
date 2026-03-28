import Users from '@models/users';
import type { IUserDocument } from '@models/users';
import { verifyAccessToken } from '@middlewares/jwt-auth';

/**
 * GraphQL context — populated once per request.
 * The authenticated user (if any) is available as `context.user`.
 */
export interface IGraphQLContext {
    user: IUserDocument | undefined;
}

/**
 * Build the context for each incoming GraphQL request.
 * Extracts and verifies the JWT from the Authorization header.
 *
 * @param request - Fetch API Request provided by graphql-yoga
 */
export const buildContext = async ({ request }: { request: Request }): Promise<IGraphQLContext> => {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.split(' ')[1];

    if (!token)
        return { user: undefined };

    try {
        const { id } = await verifyAccessToken(token);
        const user = await Users.findById(id);
        return { user: user ?? undefined };
    } catch {
        return { user: undefined };
    }
};

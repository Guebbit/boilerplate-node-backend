import { GraphQLError } from 'graphql';
import UserService from '@services/users';
import {
    createRefreshToken,
    createAccessToken,
} from '@middlewares/jwt-auth';
import { Types } from 'mongoose';

/**
 * Account mutation resolvers (login / signup).
 * These do not require an existing session.
 */
const accountMutations = {
    login: async (
        _parent: unknown,
        { email, password }: { email: string; password: string },
    ) => {
        const result = await UserService.login(email, password);

        if (!result.success)
            throw new GraphQLError(result.message, { extensions: { code: 'UNAUTHORIZED' } });

        const user = result.data!;
        const userId = (user._id as Types.ObjectId).toString();
        const refreshToken = await createRefreshToken(userId);
        const accessToken = await createAccessToken(refreshToken);

        return { token: accessToken };
    },

    signup: async (
        _parent: unknown,
        {
            email,
            username,
            password,
            passwordConfirm,
            imageUrl,
        }: {
            email: string;
            username: string;
            password: string;
            passwordConfirm: string;
            imageUrl?: string;
        },
    ) => {
        const result = await UserService.signup(email, username, password, passwordConfirm, imageUrl);

        if (!result.success)
            throw new GraphQLError(result.message, { extensions: { code: 'BAD_USER_INPUT' } });

        return (result.data as { toObject?: () => unknown }).toObject?.() ?? result.data;
    },
};

export default accountMutations;

import type { FastifyPluginAsync } from 'fastify';
import { t } from 'i18next';
import { Types } from 'mongoose';
import UserService from '@services/users';
import UserRepository from '@repositories/users';
import {
    createRefreshToken,
    createAccessToken,
} from '@middlewares/jwt-auth';
import {
    createRefreshCookie,
    createLoggedCookie,
    destroyRefreshCookie,
    destroyLoggedCookie,
} from '@middlewares/jwt-auth-fastify';
import { getAuth, isAuth } from '@middlewares/authorizations-fastify';
import { successResponse, rejectResponse } from '@utils/response-fastify';

/**
 * Auth / Account routes mounted at /account
 */
const authRoutes: FastifyPluginAsync = async (fastify) => {

    // Populate request.user for every route in this plugin
    fastify.addHook('preHandler', getAuth);

    /**
     * GET /account
     * Returns the full profile of the authenticated user.
     */
    fastify.get('/', { preHandler: [isAuth] }, async (request, reply) => {
        if (!request.user) {
            rejectResponse(reply, 401, 'Unauthorized');
            return;
        }
        successResponse(reply, request.user.toObject());
    });

    /**
     * POST /account/login
     * Authenticates a user and returns JWT access token + sets refresh cookie.
     */
    fastify.post('/login', async (request, reply) => {
        const { email, password } = (request.body ?? {}) as { email?: string; password?: string };
        const result = await UserService.login(email, password);
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        const user = result.data!;
        const userId = (user._id as Types.ObjectId).toString();
        const refreshToken = await createRefreshToken(userId);
        createRefreshCookie(reply, refreshToken);
        createLoggedCookie(reply);
        const accessToken = await createAccessToken(refreshToken);
        successResponse(reply, { token: accessToken });
    });

    /**
     * POST /account/signup
     * Registers a new user account.
     */
    fastify.post('/signup', async (request, reply) => {
        const { email, username, password, passwordConfirm, imageUrl } = (request.body ?? {}) as Record<string, string | undefined>;
        const result = await UserService.signup(
            email ?? '',
            username ?? '',
            password ?? '',
            passwordConfirm ?? '',
            imageUrl,
        );
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        successResponse(reply, result.data, 201);
    });

    /**
     * POST /account/reset
     * Initiates password-reset flow by sending a one-time token to the email.
     * Always returns 200 to prevent email enumeration.
     */
    fastify.post('/reset', async (request, reply) => {
        const { email } = (request.body ?? {}) as { email?: string };
        try {
            if (email) {
                const user = await UserRepository.findOne({ email });
                if (user)
                    await UserService.tokenAdd(user, 'password', 3_600_000); // 1 hour
            }
        } catch {
            // silent — do not reveal whether the email exists
        }
        successResponse(reply, undefined, 200, t('reset.email-sent'));
    });

    /**
     * POST /account/reset-confirm
     * Validates a one-time token and sets the new password.
     */
    fastify.post('/reset-confirm', async (request, reply) => {
        const { token, password, passwordConfirm } = (request.body ?? {}) as Record<string, string | undefined>;

        if (!token) {
            rejectResponse(reply, 422, 'reset-confirm - missing token', [t('generic.error-missing-data')]);
            return;
        }

        try {
            const user = await UserRepository.findOne({
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'tokens.token': token,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'tokens.type': 'password',
            });

            if (!user) {
                rejectResponse(reply, 422, 'reset-confirm - invalid token', [t('reset.token-not-found')]);
                return;
            }

            const tokenEntry = user.tokens.find(tk => tk.token === token && tk.type === 'password');
            if (!tokenEntry || (tokenEntry.expiration && tokenEntry.expiration < new Date())) {
                rejectResponse(reply, 422, 'reset-confirm - expired token', [t('reset.token-not-found')]);
                return;
            }

            const result = await UserService.passwordChange(user, password ?? '', passwordConfirm ?? '');
            if (!result.success) {
                rejectResponse(reply, result.status, result.message, result.errors);
                return;
            }

            // Consume the token
            user.tokens = user.tokens.filter(tk => tk.token !== token);
            await UserRepository.save(user);

            destroyRefreshCookie(reply);
            destroyLoggedCookie(reply);
            successResponse(reply, undefined, 200, t('reset.success'));
        } catch {
            rejectResponse(reply, 500, 'Internal Server Error');
        }
    });
};

export default authRoutes;

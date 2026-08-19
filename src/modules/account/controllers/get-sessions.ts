import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { userRepository, TokenType } from '@modules/users';
import type { Token } from '@modules/users';
import type { Session } from '@types';

/**
 * Map one stored refresh token to the wire's `Session`.
 *
 * The token VALUE never leaves this function — a live refresh token is as good as a password —
 * so the subdocument id is the handle, and `current` is derived by comparing against the
 * caller's own refresh cookie. A caller authenticating by bearer token alone has no cookie, and
 * an access token does not identify a session, so every entry is honestly `current: false`.
 */
const toSession = (token: Token, cookieToken?: string): Session => ({
    id: String(token._id),
    ...(token.expiration ? { expiration: token.expiration.toISOString() } : {}),
    current: cookieToken !== undefined && token.token === cookieToken
});

/**
 * GET /account/sessions
 * List the authenticated user's live refresh tokens as sessions.
 */
export const getSessions = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = request.authContext!;
    const cookieToken = (request.cookies as Record<string, string | undefined>).jwt;

    return (
        userRepository
            // `tokens` is select:false — listing them is this endpoint's whole point.
            .findByIdWithCredentials(id)
            .then((user) => {
                if (!user) {
                    rejectResponse(response, 404);
                    return;
                }

                /*
                 * Refresh tokens only. The other kinds a document holds — a pending reset, a
                 * delete confirmation, a verification link — are one-time secrets in flight,
                 * not sessions, and listing them would leak that such an operation is pending.
                 */
                const sessions = user.tokens
                    .filter((token) => token.type === (TokenType.REFRESH as string))
                    .map((token) => toSession(token, cookieToken));

                successResponse(response, { sessions });
            })
            .catch((error: Error) => {
                rejectDatabaseError(response, 'getSessions', error);
            })
    );
};

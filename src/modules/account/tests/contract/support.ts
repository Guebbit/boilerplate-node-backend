/**
 * @module
 * Setup the account contract suites share.
 */

import { api } from '@tests/http';
import { setCookie, cookieValue } from '@tests/cookies';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { decodeJwt } from 'jose';
import { getSessionMode } from '../../session/config';
import { sessionRowsOf } from '../factories';

/**
 * Log a user in keeping BOTH credentials: a bearer and the session cookie. The cookie is what
 * `current`, logout and refresh hang on, and `authenticateAs` deliberately drops it.
 *
 * The bearer is mode-agnostic: the access token in `jwt` mode, and in `cookie` mode the session id
 * itself, which `Authorization: Bearer ses_…` accepts as well as the cookie does.
 */
export const loginWithCookie = async (overrides: Parameters<typeof createUser>[0] = {}) => {
    const user = await createUser(overrides);
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });

    if (response.status !== 200)
        throw new Error(
            `login setup failed: ${response.status} — ${JSON.stringify(response.body)}`
        );

    const jwtCookie = setCookie(response, '__Host-session');
    if (!jwtCookie) throw new Error('login set no session cookie');

    return {
        user,
        bearer: `Bearer ${(response.body.data.token as string | undefined) ?? cookieValue(jwtCookie)}` as const,
        jwtCookie
    };
};

/**
 * The bearer a login-shaped response hands back: the access token in `jwt` mode, and in `cookie`
 * mode the `ses_…` id a `bearer`-transport caller is given.
 *
 * @param response - a login, re-proof or password-change response
 */
export const bearerIn = (response: { body: { data: { token?: string; sessionToken?: string } } }) =>
    `Bearer ${response.body.data.token ?? response.body.data.sessionToken ?? ''}` as const;

/**
 * What the session a response opened says its holder proved (`amr`): the claim inside the access
 * token in `jwt` mode, the newest session row's field in `cookie` mode, where the credential is
 * an opaque id and the claim lives only in the database.
 *
 * @param response - a login, re-proof or password-change response
 * @param userId - the account, for the row lookup
 */
export const claimedAmr = async (
    response: { body: { data: { token?: string } } },
    userId: string
): Promise<string[]> => {
    if (getSessionMode() === 'jwt')
        return (decodeJwt(response.body.data.token ?? '') as { amr: string[] }).amr;
    const rows = await sessionRowsOf(userId);
    return rows.at(-1)?.amr ?? [];
};

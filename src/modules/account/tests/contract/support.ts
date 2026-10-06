/**
 * @module
 * Setup the account contract suites share.
 */

import { api } from '@tests/http';
import { setCookie } from '@tests/cookies';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';

/**
 * Log a user in keeping BOTH credentials: the bearer token and the refresh cookie. The cookie is
 * what `current`, logout and refresh hang on, and `authenticateAs` deliberately drops it.
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

    const jwtCookie = setCookie(response, '__Host-jwt');
    if (!jwtCookie) throw new Error('login set no jwt cookie');

    return {
        user,
        bearer: `Bearer ${response.body.data.token as string}` as const,
        jwtCookie
    };
};

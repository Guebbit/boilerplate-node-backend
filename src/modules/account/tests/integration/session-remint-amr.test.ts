/**
 * @module
 * Every path that replaces a live session says what the replacement proves: a verified code adds
 * `otp` to what the caller held, a password change claims the password alone, nothing is
 * defaulted. The table is path -> the `amr` of the cookie it hands back.
 */

import { decodeJwt } from 'jose';
import type { Response } from 'supertest';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { codeFor } from '@tests/totp';
import { forgetSessionEpoch } from '@tests/session-epoch';
import { setCookie } from '@tests/cookies';
import { createUser, PLAIN_PASSWORD, REPLACEMENT_PASSWORD } from '@modules/users/tests/factories';
import { createAccessToken, continueSession } from '../../session/jwt';
import { MFA_CHALLENGE_TOKEN_TYPE } from '../../token-types';
import { plantToken } from '../factories';

setupTestDb();

/** A session proving `amr`, minted straight from the token layer (a re-mint, so no guard applies). */
const sessionWith = async (userId: string, amr: string[]) => {
    const refreshToken = await continueSession(userId, amr);
    const token = await createAccessToken(refreshToken);
    return { bearer: `Bearer ${token}`, cookie: `__Host-session=${refreshToken}` };
};

/** The `amr` a response's refreshed session cookie claims. */
const amrOfCookie = (response: Response): unknown => {
    const cookie = setCookie(response, '__Host-session');
    if (!cookie) throw new Error(`No session cookie: ${response.status}`);
    return decodeJwt(cookie.slice('__Host-session='.length).split(';', 1)[0]).amr;
};

/** An account whose TOTP factor is armed, and the secret that mints its codes. */
const armedAccount = async () => {
    const user = await createUser({ verifiedAt: new Date() });
    const { bearer } = await sessionWith(user.id, ['pwd']);
    const setup = await api()
        .post('/account/2fa/methods/totp/setup')
        .set('Authorization', bearer)
        .send();
    const { secret } = setup.body.data as { secret: string };
    await api()
        .post('/account/2fa/methods/totp/confirm')
        .set('Authorization', bearer)
        .send({ code: await codeFor(secret, 0) });
    await forgetSessionEpoch();
    return { user, secret };
};

describe('the proofs a re-minted session claims', () => {
    it('adds otp when a second factor is confirmed', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const { bearer } = await sessionWith(user.id, ['pwd']);
        const setup = await api()
            .post('/account/2fa/methods/totp/setup')
            .set('Authorization', bearer)
            .send();

        const confirm = await api()
            .post('/account/2fa/methods/totp/confirm')
            .set('Authorization', bearer)
            .send({ code: await codeFor((setup.body.data as { secret: string }).secret, 0) });

        expect(amrOfCookie(confirm)).toEqual(['pwd', 'otp']);
    });

    it('adds otp when the second factor is turned off with a code', async () => {
        const { user, secret } = await armedAccount();
        const { bearer } = await sessionWith(user.id, ['pwd', 'otp']);

        const response = await api()
            .delete('/account/2fa')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 1) });

        expect(amrOfCookie(response)).toEqual(['pwd', 'otp']);
    });

    it('claims the password alone after a password change, whatever the old session proved', async () => {
        const { user } = await armedAccount();
        const { bearer } = await sessionWith(user.id, ['pwd', 'otp']);

        const response = await api().post('/account/password').set('Authorization', bearer).send({
            currentPassword: PLAIN_PASSWORD,
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        });

        expect(response.status).toBe(200);
        expect(amrOfCookie(response)).toEqual(['pwd']);
    });
});

describe('a login challenge that names no proof', () => {
    it('is refused even with a right code, and mints no session', async () => {
        const { user, secret } = await armedAccount();
        await plantToken(user.id, MFA_CHALLENGE_TOKEN_TYPE, 'challenge-without-amr');

        const response = await api()
            .post('/account/login/2fa')
            .send({ challenge: 'challenge-without-amr', code: await codeFor(secret, 1) });

        expect(response.status).toBe(401);
        expect(setCookie(response, '__Host-session')).toBeUndefined();
    });
});

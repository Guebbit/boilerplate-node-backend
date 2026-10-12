/**
 * @module
 * A session keeps one id across refresh rotation. Every refresh mints a new token row, so an id
 * taken from the row would go stale at the first rotation: "log out that device" would pull the
 * dead predecessor, answer success, and leave the device signed in.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { cookieHeader } from '@tests/cookies';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { withEnvironmentOverrides } from '@tests/environment';
import { advanceDate, freezeDate } from '@tests/clock';
import { createRefreshToken, rotateRefreshToken, TokenReuseError } from '../../session/jwt';
import { RefreshTokenExpiryTime } from '../../session/config';

setupTestDb();

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
});

/** A login: the access token as a bearer, and the refresh cookie as a `Cookie` header. */
const loginAs = async (email: string) => {
    const response = await api().post('/account/login').send({ email, password: PLAIN_PASSWORD });
    return {
        bearer: `Bearer ${response.body.data.token as string}`,
        cookie: cookieHeader(response, '__Host-session')
    };
};

/** Exchanges a refresh cookie for the next one. */
const refresh = (cookie: string) => api().post('/account/refresh').set('Cookie', cookie);

/** The ids `GET /account/sessions` lists, sorted. */
const sessionIds = (bearer: string): Promise<string[]> =>
    api()
        .get('/account/sessions')
        .set('Authorization', bearer)
        .then((response) =>
            (response.body.data.sessions as { id: string }[]).map(({ id }) => id).toSorted()
        );

describe('a session id across a refresh rotation', () => {
    it('is the same id before and after', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const device = await loginAs(user.email);
        const before = await sessionIds(device.bearer);

        const rotated = await refresh(device.cookie);
        const after = await sessionIds(device.bearer);

        expect(rotated.status).toBe(200);
        expect(before).toHaveLength(1);
        expect(after).toEqual(before);
    });

    it('still logs the device out when it is revoked after one rotation', async () => {
        const user = await createUser({ verifiedAt: new Date() });
        const device = await loginAs(user.email);
        const other = await loginAs(user.email);
        const [target] = await api()
            .get('/account/sessions')
            .set('Authorization', device.bearer)
            .set('Cookie', device.cookie)
            .then((response) =>
                (response.body.data.sessions as { id: string; current: boolean }[]).filter(
                    ({ current }) => !current
                )
            );
        const rotated = await refresh(other.cookie);

        // The id was read BEFORE `other` rotated: it must still name that device afterwards.
        const revoked = await api()
            .delete(`/account/sessions/${target.id}`)
            .set('Authorization', device.bearer)
            .set('Cookie', device.cookie);

        expect(revoked.status).toBe(200);
        const next = await refresh(cookieHeader(rotated, '__Host-session'));
        expect(next.status).toBe(401);
        const untouched = await refresh(device.cookie);
        expect(untouched.status).toBe(200);
    });
});

describe('reuse detection with a session family', () => {
    afterEach(() => jest.useRealTimers());

    it('revokes the rotated successor too', async () => {
        await withEnvironmentOverrides(
            { NODE_TOKEN_ROTATION_GRACE_MS: '1000', NODE_TOKEN_REUSE_WINDOW_MS: '600000' },
            async () => {
                freezeDate();
                const user = await createUser({ verifiedAt: new Date() });
                const first = await createRefreshToken(user.id, RefreshTokenExpiryTime.SHORT);
                const { refreshToken: successor } = await rotateRefreshToken(first);
                // Replaying the superseded token outside the grace window is theft.
                advanceDate(5000);

                await expect(rotateRefreshToken(first)).rejects.toBeInstanceOf(TokenReuseError);

                await expect(rotateRefreshToken(successor)).rejects.toThrow();
            }
        );
    });
});

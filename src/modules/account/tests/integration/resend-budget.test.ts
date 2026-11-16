/**
 * The signed-in credential budget is spent by wrong passwords on `/reauth` and `/password`, and by
 * nothing else: a mail resend takes no secret, so a refused one (cooldown) must not spend it.
 * Read through the real app, off the `RateLimit` header each budget's limiter writes.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';

setupTestDb();

/**
 * Reads the `r=` (remaining) of the signed-in budget off a response's `RateLimit` header.
 * @throws {Error} when the header carries no signed-in budget
 */
const signedInRemaining = (response: { headers: Record<string, unknown> }): number => {
    const header = String(response.headers.ratelimit);
    const match = /"credentials-signed-in";r=(\d+)/.exec(header);
    if (!match) throw new Error(`no signed-in budget in RateLimit: ${header}`);
    return Number(match[1]);
};

describe('a refused resend and the signed-in credential budget', () => {
    it('leaves the budget /reauth spends untouched', async () => {
        const user = await createUser({}, 'unverified');
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        const bearer = `Bearer ${login.body.token as string}`;
        const wrongReauth = () =>
            api()
                .post('/account/reauth')
                .set('Authorization', bearer)
                .send({ method: 'password', password: 'not-the-password' });

        const before = signedInRemaining(await wrongReauth());
        const sent = await api()
            .post('/account/email-verification/resend')
            .set('Authorization', bearer);
        const refused = await api()
            .post('/account/email-verification/resend')
            .set('Authorization', bearer);
        const after = signedInRemaining(await wrongReauth());

        expect(sent.status).toBe(200);
        expect(refused.status).toBe(429);
        expect(refused.headers.ratelimit).not.toContain('credentials-signed-in');
        expect(after).toBe(before - 1);
    });
});

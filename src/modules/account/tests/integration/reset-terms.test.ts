/**
 * @module
 * The Terms record on the password-reset confirm path: an account staff created holds none, so
 * its holder's first password set is where it is made. Covers the service and the route.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { testCallerContext } from '@tests/callers';
import { asReject, asSuccess } from '@tests/response';
import { withEnvironmentOverrides } from '@tests/environment';
import { createUser, REPLACEMENT_PASSWORD, userRepository } from '@modules/users/tests/factories';
import { accountService } from '@modules/account/services';
import { plantToken } from '../factories';

setupTestDb();

/** The fields a 422 names, in the answer's own `details.field`. */
const fieldsOf = (errors: { details?: Record<string, unknown> }[]): unknown[] =>
    errors.map(({ details }) => details?.field);

/** Spends `link` for the replacement password, with the tick as given. */
const confirm = (link: string, termsAccepted?: boolean) =>
    accountService.completePasswordReset(
        link,
        REPLACEMENT_PASSWORD,
        REPLACEMENT_PASSWORD,
        testCallerContext,
        termsAccepted
    );

describe('completePasswordReset, an account with no Terms record', () => {
    it('refuses without the tick, names termsAccepted, and the same link still works', async () => {
        const user = await createUser({ email: 'staff-made@example.com' });
        await plantToken(user.id, 'password', 'setup-link');

        const refused = asReject(await confirm('setup-link'));
        const accepted = asSuccess(await confirm('setup-link', true));

        expect(refused.status).toBe(422);
        expect(fieldsOf(refused.errors)).toEqual(['termsAccepted']);
        expect(accepted.status).toBe(200);
    });

    it('stamps the record with the version in force, in the same write as the password', async () => {
        const user = await createUser({ email: 'stamped@example.com' });
        await plantToken(user.id, 'password', 'stamp-link');

        await withEnvironmentOverrides({ NODE_TERMS_VERSION: '2026-11' }, () =>
            confirm('stamp-link', true)
        );

        const stored = await userRepository.findOne({ email: 'stamped@example.com' });
        expect(stored?.termsAcceptedAt).toBeInstanceOf(Date);
        expect(stored?.termsVersion).toBe('2026-11');
    });

    it('answers a dead link with the dead-link refusal, never the Terms one', async () => {
        const refused = asReject(await confirm('no-such-link'));

        expect(fieldsOf(refused.errors)).not.toContain('termsAccepted');
        expect(refused.errors.map(({ message }) => message)).toEqual([
            'Invalid or expired token, please try again.'
        ]);
    });
});

describe('completePasswordReset, an account that already accepted', () => {
    it('ignores the field and keeps the earlier record untouched', async () => {
        const acceptedAt = new Date('2026-01-02T03:04:05Z');
        const user = await createUser({
            email: 'has-record@example.com',
            termsAcceptedAt: acceptedAt.toISOString(),
            termsVersion: '1'
        });
        await plantToken(user.id, 'password', 'known-link');

        const result = asSuccess(await confirm('known-link'));

        const stored = await userRepository.findOne({ email: 'has-record@example.com' });
        expect(result.status).toBe(200);
        expect(stored?.termsAcceptedAt?.toISOString()).toBe(acceptedAt.toISOString());
    });
});

describe('POST /account/password/reset/confirm, the termsAccepted field', () => {
    it('takes the tick for an account with no record, and refuses without it', async () => {
        const user = await createUser({ email: 'route-staff@example.com' });
        await plantToken(user.id, 'password', 'route-link');
        const body = {
            token: 'route-link',
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD
        };

        const without = await api().post('/account/password/reset/confirm').send(body);
        const withTick = await api()
            .post('/account/password/reset/confirm')
            .send({ ...body, termsAccepted: true });

        expect(without.status).toBe(422);
        expect(fieldsOf(without.body.errors)).toEqual(['termsAccepted']);
        expect(withTick.status).toBe(204);
    });

    it('refuses a termsAccepted that is not literally true', async () => {
        const user = await createUser({ email: 'route-false@example.com' });
        await plantToken(user.id, 'password', 'false-link');

        const response = await api().post('/account/password/reset/confirm').send({
            token: 'false-link',
            password: REPLACEMENT_PASSWORD,
            passwordConfirm: REPLACEMENT_PASSWORD,
            termsAccepted: false
        });

        expect(response.status).toBe(422);
    });
});

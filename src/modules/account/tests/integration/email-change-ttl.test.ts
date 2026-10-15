/**
 * @module
 * How long the two links of an email change live: the confirmation link on the new address, and the
 * undo link on the old one. The lifetimes are what the account page and the mail promise, so they
 * are pinned against literal durations, not the constants the code reads.
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { tokenRowsOf } from '../factories';

setupTestDb();

beforeEach(() => {
    setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' });
});

/** One hour, in milliseconds. */
const HOUR_MS = 60 * 60 * 1000;

describe('an email change request', () => {
    it('issues a confirmation link good for 24 hours and an undo link good for 7 days', async () => {
        const { user, bearer } = await authenticateAs('user');

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: 'new@example.com' });

        expect(response.status).toBe(200);
        const rows = await tokenRowsOf(user.id);
        const lifetimeOf = (type: string): number | undefined => {
            const row = rows.find((candidate) => candidate.type === type);
            return row && row.expiresAt.getTime() - row.sentAt.getTime();
        };
        expect(lifetimeOf('email-change')).toBe(24 * HOUR_MS);
        expect(lifetimeOf('email-change-undo')).toBe(7 * 24 * HOUR_MS);
    });
});

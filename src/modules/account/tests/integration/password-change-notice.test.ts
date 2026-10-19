/**
 * @module
 * The out-of-band notice for a signed-in password change: mailed once, to the account, when the
 * change succeeded, and never for a refused change or for a reset (which has its own mail).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import {
    createUser,
    PASSPHRASE_PASSWORD,
    REPLACEMENT_PASSWORD
} from '@modules/users/tests/factories';
import { accountService } from '@modules/account/services';
import { plantToken } from '../factories';

/**
 * Every mail the app queued, newest last. Named `mock*` because `jest.mock` is hoisted above the
 * imports and may only close over identifiers with that prefix.
 */
const mockOutbox: { to: string; template: string; data: Record<string, unknown> }[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn(
        (
            envelope: { to: string },
            template: string,
            data: Record<string, unknown>
        ): Promise<void> => {
            mockOutbox.push({ to: envelope.to, template, data });
            return Promise.resolve();
        }
    )
}));

setupTestDb();

beforeEach(() => {
    mockOutbox.length = 0;
});

/** The queued mails of one template. */
const mailsOf = (template: string) => mockOutbox.filter((mail) => mail.template === template);

/** On the bundled breach list and strong enough to clear the composition rules. */
const BREACHED = 'Password1!';

describe('the notice after a signed-in password change', () => {
    it('mails the account once, with advice and no link', async () => {
        const user = await createUser({ password: PASSPHRASE_PASSWORD });

        await accountService.passwordChangeWithCurrent(
            user.id,
            PASSPHRASE_PASSWORD,
            REPLACEMENT_PASSWORD,
            REPLACEMENT_PASSWORD,
            testCallerContext
        );

        const [mail, ...rest] = mailsOf('account.password-changed');
        expect(rest).toEqual([]);
        expect(mail?.to).toBe(user.email);
        expect(mail?.data.advice).toEqual(expect.stringContaining('Forgot password'));
        expect(JSON.stringify(mail?.data)).not.toContain('linkUrl');
    });

    it.each([
        ['a wrong current password', 'wrong-guess', REPLACEMENT_PASSWORD, REPLACEMENT_PASSWORD],
        ['a mistyped confirmation', PASSPHRASE_PASSWORD, REPLACEMENT_PASSWORD, 'different'],
        ['a breached new password', PASSPHRASE_PASSWORD, BREACHED, BREACHED]
    ])('mails nothing for %s', async (_name, current, password, confirm) => {
        const user = await createUser({ password: PASSPHRASE_PASSWORD });

        const outcome = await accountService.passwordChangeWithCurrent(
            user.id,
            current,
            password,
            confirm,
            testCallerContext
        );

        expect(outcome.success).toBe(false);
        expect(mailsOf('account.password-changed')).toEqual([]);
    });

    it('is not what a reset sends: a reset mails its own confirmation', async () => {
        const user = await createUser({ password: PASSPHRASE_PASSWORD });
        await plantToken(user.id, 'password', 'reset-link', { ttlMs: 3_600_000 });

        await accountService.completePasswordReset(
            'reset-link',
            REPLACEMENT_PASSWORD,
            REPLACEMENT_PASSWORD,
            testCallerContext
        );

        expect(mailsOf('account.password-changed')).toEqual([]);
        expect(mailsOf('account.reset-confirm')).toHaveLength(1);
    });
});

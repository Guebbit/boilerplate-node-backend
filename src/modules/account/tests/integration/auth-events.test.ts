/**
 * @module
 * What a refused one-time link token and a failed login leave in the audit trail. `auth.*`, not
 * `security.*`: a customer with a stale link is the usual cause. The failed-login target is a
 * normalised keyed digest, so a spray cannot hide behind letter case.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { advanceDate, freezeDate } from '@tests/clock';
import { auditLogger } from '@infrastructure/adapters/logger';
import { pseudonymise } from '@infrastructure/security/pseudonymise';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { TokenType } from '@modules/users';
import { accountAuditActions } from '@modules/account/audit';
import { authOneTimeTokenRejectedTotal } from '@modules/account/metrics';

setupTestDb();

/** One audit entry as the logger receives it. */
interface Entry {
    action: string;
    target_id?: string;
    metadata?: Record<string, unknown>;
}

let auditSpy: jest.SpyInstance;

beforeEach(() => {
    auditSpy = jest.spyOn(auditLogger, 'log').mockImplementation(() => auditLogger);
});

afterEach(() => {
    auditSpy.mockRestore();
    jest.useRealTimers();
});

/** Every audit entry the logger saw so far. */
const entries = (): Entry[] => auditSpy.mock.calls.map((call: unknown[]) => call[2] as Entry);

/** The `flow` of every rejected-token entry. */
const rejectedFlows = (): unknown[] =>
    entries()
        .filter((entry) => entry.action === accountAuditActions.AUTH_ONE_TIME_TOKEN_REJECTED)
        .map((entry) => entry.metadata?.flow);

describe('an unknown one-time token', () => {
    it.each([
        ['password_reset', 'post', '/account/reset-confirm'],
        ['email_verify', 'post', '/account/verify-confirm'],
        ['email_change', 'post', '/account/email-change-confirm'],
        ['account_delete', 'delete', '/account/delete-confirm']
    ] as const)('is audited and counted by the %s flow', async (flow, method, route) => {
        authOneTimeTokenRejectedTotal.reset();

        // The contract bodies are strict: only the reset carries the password fields.
        const body =
            flow === 'password_reset'
                ? {
                      token: 'never-issued',
                      password: PLAIN_PASSWORD,
                      passwordConfirm: PLAIN_PASSWORD
                  }
                : { token: 'never-issued' };
        const response = await api()[method](route).send(body);

        expect(response.status).toBe(422);
        expect(rejectedFlows()).toEqual([flow]);
        const counted = await authOneTimeTokenRejectedTotal.get();
        expect(counted.values).toEqual([expect.objectContaining({ labels: { flow }, value: 1 })]);
    });

    it('is also what an expired reset token reads as', async () => {
        freezeDate();
        const user = await createUser();
        await user.tokenAdd(TokenType.PASSWORD_RESET, 60_000, 'soon-expired-token');
        advanceDate(3_600_000);

        await api().post('/account/reset-confirm').send({
            token: 'soon-expired-token',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD
        });

        expect(rejectedFlows()).toEqual(['password_reset']);
    });

    it('is not recorded when the password pair is what was refused', async () => {
        await api().post('/account/reset-confirm').send({
            token: 'never-issued',
            password: PLAIN_PASSWORD,
            passwordConfirm: 'different'
        });

        expect(rejectedFlows()).toEqual([]);
    });
});

describe('a failed login', () => {
    it('names the attempted address as a normalised keyed digest, never the address', async () => {
        await api().post('/account/login').send({ email: '  Victim@Example.COM ', password: 'x' });

        const failure = entries().find((entry) => entry.action === accountAuditActions.AUTH_LOGIN);
        expect(failure?.target_id).toBe(pseudonymise('log', 'victim@example.com'));
        expect(JSON.stringify(entries())).not.toMatch(/victim@example/i);
    });

    it('records no target when the email is not a string', async () => {
        await api()
            .post('/account/login')
            .send({ email: { $ne: '' }, password: 'x' });

        const failure = entries().find((entry) => entry.action === accountAuditActions.AUTH_LOGIN);
        expect(failure).toBeDefined();
        expect(failure?.target_id).toBeUndefined();
    });
});

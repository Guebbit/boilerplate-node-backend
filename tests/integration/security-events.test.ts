/**
 * @module
 * The credential refusals the guards audit and count, driven over HTTP through the real app. A
 * forged value is an attack (`security.*`, a stored row); an expired session, or no credential at
 * all, is a log line and a counter. One test per event, and the failed-login identity is checked
 * here too since it travels the same audit door.
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { credentialHolding } from '@tests/credentials';
import { advanceDate, freezeDate } from '@tests/clock';
import { auditLogger } from '@infrastructure/adapters/logger';
import { apiKeyRepository } from '@modules/api-keys/repository';
import { auditLogRepository, AUDIT_SORT } from '@modules/audit-logs/repository';
import { signWebhookPayload, WEBHOOK_SIGNATURE_HEADER } from '@modules/payments/providers';
import { withEnvironmentOverrides } from '@tests/environment';
import { coreAuditActions } from '@infrastructure/observability/audit';
import { paymentsAuditActions } from '@modules/payments/audit';
import { observabilityAuditActions } from '@modules/observability/audit';
import { staleCredentialsTotal } from '@infrastructure/observability/security-events';

setupTestDb();

/** Every audit entry the logger saw, as `[action, event]`. */
const audited = (spy: jest.SpyInstance): { action: string; metadata?: Record<string, unknown> }[] =>
    spy.mock.calls.map(
        (call: unknown[]) => call[2] as { action: string; metadata?: Record<string, unknown> }
    );

/**
 * Polls until the sink has stored a row for `action`: the write is fire-and-forget, so the request
 * that caused it has already been answered.
 */
const waitForStored = async (action: string): Promise<void> => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const stored = await auditLogRepository.search({ action }, {}, AUDIT_SORT);
        if (stored.items.length > 0) return;
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });
    }
    throw new Error(`no ${action} row was ever stored`);
};

/**
 * Every stored `security.*` action once the sink has caught up. Absence cannot be polled for, so a
 * forged token is sent as a flush: a row that is known to be written, issued after anything the
 * case did, whose arrival says the earlier writes have had their turn.
 */
const storedSecurityActionsAfterFlush = (): Promise<string[]> =>
    api()
        .get('/account')
        .set('Authorization', 'Bearer not-a-jwt')
        .then(() => waitForStored(coreAuditActions.SECURITY_TOKEN_MALFORMED))
        .then(() =>
            auditLogRepository.search({}, { action: { $regex: /^security\./ } }, AUDIT_SORT)
        )
        .then((page) => page.items.map((item) => item.action));

/** Spy on the audit emitter; each case reads what the flow recorded. */
let auditSpy: jest.SpyInstance;

beforeEach(() => {
    auditSpy = jest.spyOn(auditLogger, 'log').mockImplementation(() => auditLogger);
});

afterEach(() => {
    auditSpy.mockRestore();
    jest.useRealTimers();
});

describe('a refused bearer JWT', () => {
    it('audits a token that is not a JWT as malformed', async () => {
        const response = await api().get('/account').set('Authorization', 'Bearer not-a-jwt');

        expect(response.status).toBe(401);
        expect(audited(auditSpy)).toContainEqual(
            expect.objectContaining({
                action: coreAuditActions.SECURITY_TOKEN_MALFORMED,
                metadata: expect.objectContaining({ kind: 'session', route: '/' })
            })
        );
    });

    it('audits a token with a tampered signature as an invalid signature', async () => {
        const { token } = await authenticateAs('user');
        auditSpy.mockClear();
        const [header, payload] = token.split('.', 2);

        await api().get('/account').set('Authorization', `Bearer ${header}.${payload}.AAAA`);

        expect(audited(auditSpy)).toContainEqual(
            expect.objectContaining({ action: coreAuditActions.SECURITY_TOKEN_INVALID_SIGNATURE })
        );
    });

    it('logs a request with no credential as a line, and stores no row', async () => {
        const response = await api().get('/account');

        expect(response.status).toBe(401);
        expect(audited(auditSpy)).toContainEqual(
            expect.objectContaining({
                action: coreAuditActions.SECURITY_UNAUTHORIZED,
                metadata: expect.objectContaining({ reason: 'not_authenticated', method: 'GET' })
            })
        );
        expect(await storedSecurityActionsAfterFlush()).not.toContain(
            coreAuditActions.SECURITY_UNAUTHORIZED
        );
    });

    it('stores a forged token as a row, which a request with no credential never is', async () => {
        await api().get('/account').set('Authorization', 'Bearer not-a-jwt');
        await waitForStored(coreAuditActions.SECURITY_TOKEN_MALFORMED);

        expect(
            await auditLogRepository.search(
                { action: coreAuditActions.SECURITY_TOKEN_MALFORMED },
                {},
                AUDIT_SORT
            )
        ).toMatchObject({ items: [expect.objectContaining({ outcome: 'failure' })] });
    });

    it('counts and logs an expired token, since a customer is behind it', async () => {
        freezeDate();
        const { bearer } = await authenticateAs('user');
        auditSpy.mockClear();
        staleCredentialsTotal.reset();
        advanceDate(24 * 3_600_000);

        const response = await api().get('/account').set('Authorization', bearer);

        expect(response.status).toBe(401);
        expect(audited(auditSpy).map((entry) => entry.action)).not.toContain(
            coreAuditActions.SECURITY_TOKEN_INVALID_SIGNATURE
        );
        expect(audited(auditSpy)).toContainEqual(
            expect.objectContaining({
                action: coreAuditActions.SECURITY_UNAUTHORIZED,
                metadata: expect.objectContaining({ kind: 'session', reason: 'expired' })
            })
        );
        expect(JSON.stringify(auditSpy.mock.calls)).not.toContain(bearer.replace('Bearer ', ''));
        expect(await storedSecurityActionsAfterFlush()).not.toContain(
            coreAuditActions.SECURITY_UNAUTHORIZED
        );
        const counted = await staleCredentialsTotal.get();
        expect(counted.values).toContainEqual(
            expect.objectContaining({ labels: { kind: 'session', reason: 'expired' }, value: 1 })
        );
    });
});

describe('a refused sk_ credential', () => {
    it('audits a key presented with its real secret after revocation', async () => {
        const secret = await credentialHolding(['display:Product']);
        const stored = await apiKeyRepository.findAnyByPrefix(secret.slice(3, 11));
        await apiKeyRepository.revokeMany([String(stored?._id)], new Date());
        auditSpy.mockClear();

        await api().get('/products').set('Authorization', `Bearer ${secret}`);

        expect(audited(auditSpy)).toContainEqual(
            expect.objectContaining({
                action: coreAuditActions.SECURITY_API_KEY_REVOKED,
                metadata: expect.objectContaining({ kind: 'api_key' })
            })
        );
    });

    it('audits a well-formed key nobody minted as an invalid signature', async () => {
        await api().get('/products').set('Authorization', 'Bearer sk_abcdefgh_notarealsecret');

        expect(audited(auditSpy)).toContainEqual(
            expect.objectContaining({ action: coreAuditActions.SECURITY_TOKEN_INVALID_SIGNATURE })
        );
    });
});

/** Posts `body` with the given signature header value. */
const deliver = (body: string, signature: string) =>
    api()
        .post('/payments/webhook/fake')
        .set('Content-Type', 'application/json')
        .set(WEBHOOK_SIGNATURE_HEADER, signature)
        .send(body);

describe('a refused payment webhook', () => {
    it('audits a signature that does not verify', async () => {
        const body = JSON.stringify({ id: 'evt_1', providerRef: 'x', status: 'succeeded' });
        const forged = signWebhookPayload(JSON.stringify({ tampered: true }));

        const response = await deliver(body, forged);

        expect(response.status).toBe(400);
        expect(audited(auditSpy)).toContainEqual(
            expect.objectContaining({
                action: paymentsAuditActions.SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE,
                metadata: expect.objectContaining({ reason: 'Signature does not match' })
            })
        );
    });

    it('audits a header that is not a signature at all', async () => {
        await deliver('{}', 'garbage');

        expect(audited(auditSpy)).toContainEqual(
            expect.objectContaining({
                action: paymentsAuditActions.SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE
            })
        );
    });

    it('leaves a correctly signed but unparseable body to the log', async () => {
        const body = 'not json';

        const response = await deliver(body, signWebhookPayload(body));

        expect(response.status).toBe(400);
        expect(audited(auditSpy).map((entry) => entry.action)).not.toContain(
            paymentsAuditActions.SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE
        );
    });
});

describe('a wrong metrics token', () => {
    it('audits a guessed token', async () => {
        await withEnvironmentOverrides({ NODE_METRICS_TOKEN: 'scrape-me' }, async () => {
            const response = await api()
                .get('/observability/metrics')
                .set('Authorization', 'Bearer guess');

            expect(response.status).toBe(401);
        });

        expect(audited(auditSpy)).toContainEqual(
            expect.objectContaining({
                action: observabilityAuditActions.SECURITY_METRICS_TOKEN_INVALID
            })
        );
    });

    it('does not audit a scrape that carries no token at all', async () => {
        await withEnvironmentOverrides({ NODE_METRICS_TOKEN: 'scrape-me' }, async () => {
            await api().get('/observability/metrics');
        });

        expect(audited(auditSpy).map((entry) => entry.action)).not.toContain(
            observabilityAuditActions.SECURITY_METRICS_TOKEN_INVALID
        );
    });
});

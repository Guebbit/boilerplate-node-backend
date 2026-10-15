/**
 * @module
 * `account.sessions-revoked` travels through the transactional outbox: it commits with the
 * credential write and the epoch bump, and a failing `api-keys` consumer is retried by the relay
 * instead of being logged and forgotten. Driven over HTTP, the way a real reset and a real
 * logout-everywhere arrive.
 */

import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { credentialOf } from '@tests/credentials';
import apiKeysModule from '@modules/api-keys/module';
import { mint } from '@modules/api-keys/services/api-keys';
import { apiKeyRepository } from '@modules/api-keys/repository';
import { createUser, PLAIN_PASSWORD, REPLACEMENT_PASSWORD } from '@modules/users/tests/factories';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { permissionsOfRole } from '@kernel/permissions';
import { outboxEventModel, relayOutbox, settleOutboxNudges } from '@kernel/outbox';
import type { TenantCallerContext } from '@types';
import * as auditPort from '@infrastructure/observability/audit';
import { plantToken } from '@modules/account/tests/factories';

/* Replaced, not spied on — `recordAudit` closes over its own module's `emitAuditEvent`. */
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});
const mockEmitAuditEvent = auditPort.emitAuditEvent as jest.MockedFunction<
    typeof auditPort.emitAuditEvent
>;

/** The compromise revocations audited so far. */
const compromiseAudits = () =>
    mockEmitAuditEvent.mock.calls.filter(
        ([event]) => event.action === 'system.api_keys.revoked_on_compromise'
    );

setupTestDb();

// Installs the credential resolver, as a real boot does once the module is enabled.
apiKeysModule.onRegistered?.();

beforeEach(() => {
    mockEmitAuditEvent.mockClear();
    setEnvironment({ NODE_MAIL_TRANSPORT: 'log' });
});

afterEach(() => {
    jest.restoreAllMocks();
});

/** An admin who has minted one live credential: the user, a login bearer, the key's secret. */
const adminWithKey = async () => {
    const user = await createUser({ verifiedAt: new Date() }, 'admin');
    const context: TenantCallerContext = {
        caller: {
            id: user.id,
            tenantId: DEPLOYMENT_TENANT_ID,
            scope: 'tenant',
            permissions: permissionsOfRole('admin'),
            unrestricted: false,
            system: false,
            level: 'admin'
        },
        analyticsConsent: false
    };
    const minted = await mint(
        {
            name: 'ci',
            permissions: ['apikeys.any.read'],
            expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString()
        },
        context
    );
    const login = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    return {
        user,
        bearer: `Bearer ${login.body.data.token as string}`,
        secret: minted.data?.secret ?? ''
    };
};

/** Spends a reset link the way the mailed page does. */
const resetWith = (token: string) =>
    api().post('/account/reset-confirm').send({
        token,
        password: REPLACEMENT_PASSWORD,
        passwordConfirm: REPLACEMENT_PASSWORD
    });

/** Makes every parked row due now, so the next relay pass does not wait out its backoff. */
const makeDue = () =>
    outboxEventModel.updateMany({}, { $set: { nextAttemptAt: new Date(0) } }).exec();

/** The pending `account.sessions-revoked` rows. */
const pendingRows = () =>
    outboxEventModel.find({ name: 'account.sessions-revoked', status: 'pending' }).lean().exec();

describe('account.sessions-revoked through the outbox', () => {
    it('a throwing api-keys consumer leaves the row pending, and the relay retry revokes the keys', async () => {
        const { user, secret } = await adminWithKey();
        await plantToken(user.id, 'password', 'outbox-reset', { ttlMs: 3_600_000 });
        jest.spyOn(apiKeyRepository, 'revokeMany').mockRejectedValueOnce(new Error('db blip'));

        const response = await resetWith('outbox-reset');
        await settleOutboxNudges();

        expect(response.status).toBe(200);
        expect(await credentialOf(secret)).toBeDefined();
        expect(await pendingRows()).toHaveLength(1);

        await makeDue();
        expect(await relayOutbox()).toMatchObject({ published: 1 });

        expect(await credentialOf(secret)).toBeUndefined();
        expect(await pendingRows()).toHaveLength(0);
    });

    it('logout everywhere takes the same road', async () => {
        const { bearer, secret } = await adminWithKey();
        jest.spyOn(apiKeyRepository, 'revokeMany').mockRejectedValueOnce(new Error('db blip'));

        const response = await api().post('/account/logout-all').set('Authorization', bearer);
        await settleOutboxNudges();

        expect(response.status).toBe(200);
        expect(await credentialOf(secret)).toBeDefined();
        expect(await pendingRows()).toHaveLength(1);

        await makeDue();
        await relayOutbox();

        expect(await credentialOf(secret)).toBeUndefined();
    });

    it('a rollback leaves no row and no new password', async () => {
        const { user } = await adminWithKey();
        await plantToken(user.id, 'password', 'outbox-rollback', { ttlMs: 3_600_000 });
        jest.spyOn(outboxEventModel, 'create').mockRejectedValueOnce(new Error('outbox down'));

        const response = await resetWith('outbox-rollback');
        await settleOutboxNudges();

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(await outboxEventModel.countDocuments({ name: 'account.sessions-revoked' })).toBe(0);
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        expect(login.status).toBe(200);
    });

    it('a redelivery revokes nothing twice', async () => {
        const { user, secret } = await adminWithKey();
        await plantToken(user.id, 'password', 'outbox-redeliver', { ttlMs: 3_600_000 });
        await resetWith('outbox-redeliver');
        await settleOutboxNudges();
        expect(await credentialOf(secret)).toBeUndefined();
        expect(compromiseAudits()).toHaveLength(1);

        // The relay delivers at least once: put the published row back and let it run again.
        await outboxEventModel
            .updateMany({ name: 'account.sessions-revoked' }, { $set: { status: 'pending' } })
            .exec();
        await relayOutbox();

        // Still the one audit row: a redelivery found nothing left to revoke.
        expect(compromiseAudits()).toHaveLength(1);
    });
});

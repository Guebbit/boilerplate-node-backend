/**
 * @module
 * What the credential service answers, audits and mails — the listing, the expiry ceiling, the
 * wording of a refusal, the audit rows, and the mails' locale. `api-keys.test.ts` owns the
 * permission-subset rules; the HTTP-level contract suite is not part of the mutation ruler, so
 * these pin the same outcomes at the service door.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { TEST_TENANT_ID } from '@tests/callers';
import { freezeDate } from '@tests/clock';
import type { TenantCallerContext } from '@types';
import { userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { resetDomainEvents, emitDomainEvent } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { ACCOUNT_SESSIONS_REVOKED } from '@modules/account';
import { logger } from '@infrastructure/adapters/logger';
import * as auditPort from '@infrastructure/observability/audit';
import { findOwnApiKeys, latestExpiry, list, mint, revoke } from '../../services/api-keys';
import { apiKeysAuditActions } from '../../audit';
import { enabledModules } from '../../../../modules';

/** Every mail queued, newest last — `mock*` so the hoisted `jest.mock` may close over it. */
const mockOutbox: {
    to?: string;
    template: string;
    subject?: string;
    data: Record<string, unknown>;
}[] = [];

jest.mock('@infrastructure/adapters/mailer', () => ({
    ...jest.requireActual<typeof import('@infrastructure/adapters/mailer')>(
        '@infrastructure/adapters/mailer'
    ),
    enqueueEmail: jest.fn(
        (
            envelope: { to?: string; subject?: string },
            template: string,
            data: Record<string, unknown> = {}
        ) => {
            mockOutbox.push({ to: envelope.to, subject: envelope.subject, template, data });
            return Promise.resolve();
        }
    )
}));

/* Replaced, not spied on — `recordAudit` closes over its own module's `emitAuditEvent`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);
const mockEmitAuditEvent = auditPort.emitAuditEvent as jest.MockedFunction<
    typeof auditPort.emitAuditEvent
>;

setupTestDb();

beforeEach(() => {
    mockOutbox.length = 0;
    mockEmitAuditEvent.mockClear();
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

/** A week out — inside the one-year ceiling. */
const IN_A_WEEK = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();

/** A persisted user, optionally with a locale of their own. */
const createRealUser = (id: string, locale?: string) =>
    userRepository.create({
        email: `${id}@example.com`,
        username: id,
        ...(locale ? { locale } : {})
    });

/** The context a call needs for one real user holding `permissions`. */
const contextFor = (
    userId: string,
    permissions: readonly string[] = ['read:WebhookSubscription'],
    tenantId: string = TEST_TENANT_ID
): TenantCallerContext => ({
    caller: {
        id: userId,
        tenantId,
        scope: 'tenant',
        permissions,
        unrestricted: false,
        system: false
    },
    analyticsConsent: false
});

/** Polls until `done` holds, up to two seconds — for a mail the code under test does not await. */
const eventually = async (done: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 40 && !done(); attempt++)
        await new Promise((resolve) => setTimeout(resolve, 50));
};

/** The audit events recorded under one action. */
const auditedAs = (action: string) =>
    mockEmitAuditEvent.mock.calls
        .map(([event]) => event)
        .filter((event) => event.action === action);

/** Mint one key and return its wire shape, or fail loudly. */
const mintKey = async (context: TenantCallerContext, name = 'ci') => {
    const minted = await mint(
        { name, permissions: ['read:WebhookSubscription'], expiresAt: IN_A_WEEK },
        context
    );
    if (!minted.data) throw new Error('setup failed: mint was refused');
    return minted.data;
};

describe('the one-year ceiling', () => {
    it('is the same calendar day a year on', () => {
        expect(latestExpiry(new Date('2030-02-28T12:00:00.000Z')).toISOString()).toBe(
            '2031-02-28T12:00:00.000Z'
        );
    });

    it('is a calendar year, not 365 days, across a leap day', () => {
        // 365 days after 2031-03-01 is 2032-02-29; a calendar year is 2032-03-01.
        expect(latestExpiry(new Date('2031-03-01T12:00:00.000Z')).toISOString()).toBe(
            '2032-03-01T12:00:00.000Z'
        );
    });

    it('refuses an expiry past it, naming the expiry it was given', async () => {
        const user = await createRealUser('too-far');
        const tooFar = new Date(Date.now() + 400 * 24 * 3_600_000).toISOString();

        const result = await mint(
            { name: 'forever', permissions: ['read:WebhookSubscription'], expiresAt: tooFar },
            contextFor(String(user._id))
        );

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable — asserted above');
        expect(result.status).toBe(422);
        expect(result.errors[0]).toMatchObject({
            code: 'VALIDATION_ERROR',
            message: 'A credential may expire at most one year from now.',
            details: { field: 'expiresAt' }
        });
    });

    it('accepts exactly the ceiling and refuses a millisecond past it', async () => {
        const user = await createRealUser('on-the-line');
        const now = new Date('2030-06-15T12:00:00.000Z');
        freezeDate(now);
        const ceiling = latestExpiry(now);
        const mintAt = (expiresAt: Date) =>
            mint(
                {
                    name: 'edge',
                    permissions: ['read:WebhookSubscription'],
                    expiresAt: expiresAt.toISOString()
                },
                contextFor(String(user._id))
            );

        const onTheLine = await mintAt(ceiling);
        const pastIt = await mintAt(new Date(ceiling.getTime() + 1));

        expect(onTheLine.success).toBe(true);
        expect(pastIt.success).toBe(false);
    });

    it('accepts an expiry a few seconds inside it', async () => {
        const user = await createRealUser('just-inside');
        const inside = new Date(latestExpiry().getTime() - 60_000).toISOString();

        const result = await mint(
            { name: 'long', permissions: ['read:WebhookSubscription'], expiresAt: inside },
            contextFor(String(user._id))
        );

        expect(result.success).toBe(true);
    });
});

describe('what a refusal says', () => {
    it('names the permissions that were not the minter’s to grant, in words', async () => {
        const user = await createRealUser('not-mintable');

        const result = await mint(
            { name: 'x', permissions: ['display:Order'], expiresAt: IN_A_WEEK },
            contextFor(String(user._id))
        );

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable — asserted above');
        expect(result.errors[0]).toMatchObject({
            code: 'VALIDATION_ERROR',
            message: 'One or more requested permissions are not yours to grant.',
            details: { permissions: ['display:Order'] }
        });
    });
});

describe('listing', () => {
    it('lists this tenant’s credentials, newest first, and no other tenant’s', async () => {
        const user = await createRealUser('lister');
        const mine = contextFor(String(user._id));
        const first = await mintKey(mine, 'first');
        const second = await mintKey(mine, 'second');
        await mintKey(
            contextFor(String(user._id), ['read:WebhookSubscription'], 'another-tenant'),
            'foreign'
        );

        const listed = await list(mine, {});

        expect(listed.items.map(({ id }) => id)).toEqual([second.id, first.id]);
    });

    it('exports a person’s own credentials, newest first, and nobody else’s', async () => {
        const user = await createRealUser('exporter');
        const other = await createRealUser('not-the-exporter');
        const context = contextFor(String(user._id));
        const first = await mintKey(context, 'first');
        const second = await mintKey(context, 'second');
        await mintKey(contextFor(String(other._id)), 'theirs');

        const own = await findOwnApiKeys(String(user._id));

        expect(own.map(({ id }) => id)).toEqual([second.id, first.id]);
    });
});

describe('minting leaves an audit row and a mail', () => {
    it('audits the mint with the permissions that were granted', async () => {
        const user = await createRealUser('audited-mint');

        const minted = await mintKey(contextFor(String(user._id)));

        expect(auditedAs(apiKeysAuditActions.ADMIN_API_KEY_MINTED)).toEqual([
            expect.objectContaining({
                outcome: 'success',
                targetType: 'api_key',
                targetId: minted.id,
                metadata: { permissions: ['read:WebhookSubscription'] }
            })
        ]);
    });

    it('mails the minter in their own language, saying which key and until when', async () => {
        const user = await createRealUser('italian-minter', 'it');

        await mintKey(contextFor(String(user._id)), 'integrazione');
        await eventually(() => mockOutbox.some(({ template }) => template === 'api-keys.minted'));

        const mail = mockOutbox.find(({ template }) => template === 'api-keys.minted');
        expect(mail?.data.locale).toBe('it');
        expect(String(mail?.data.body)).toContain('integrazione');
        expect(mail?.data.greeting).toEqual(expect.any(String));
        expect(mail?.data.greeting).not.toBe('');
        expect(mail?.data.advice).not.toBe('');
        expect(mail?.data.footer).not.toBe('');
    });

    it('still mints when the minter cannot be looked up, and says so in the log', async () => {
        const user = await createRealUser('lookup-fails');
        jest.spyOn(userService, 'getById').mockRejectedValue(new Error('db down'));
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

        const minted = await mintKey(contextFor(String(user._id)));
        await eventually(() => warn.mock.calls.length > 0);

        expect(minted.id).toBeTruthy();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(mockOutbox.filter(({ template }) => template === 'api-keys.minted')).toHaveLength(0);
    });

    it('sends nothing when the minter no longer exists', async () => {
        const user = await createRealUser('gone-minter');
        const context = contextFor(String(user._id));
        jest.spyOn(userService, 'getById').mockResolvedValue(undefined);

        await mintKey(context);
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockOutbox).toHaveLength(0);
    });
});

describe('revoking', () => {
    it('answers 404 for a key that does not exist, and for another tenant’s', async () => {
        const user = await createRealUser('revoker');
        const minted = await mintKey(
            contextFor(String(user._id), ['read:WebhookSubscription'], 'another-tenant')
        );

        const foreign = await revoke(minted.id, contextFor(String(user._id)));
        const unknown = await revoke('a'.repeat(24), contextFor(String(user._id)));

        expect([foreign.success, unknown.success]).toEqual([false, false]);
        expect([foreign, unknown].map((result) => !result.success && result.status)).toEqual([
            404, 404
        ]);
    });

    it('audits the first revoke with the credential’s display id, and a repeat adds nothing', async () => {
        const user = await createRealUser('revoke-audit');
        const context = contextFor(String(user._id));
        const minted = await mintKey(context);

        await revoke(minted.id, context);
        await revoke(minted.id, context);

        expect(auditedAs(apiKeysAuditActions.ADMIN_API_KEY_REVOKED)).toEqual([
            expect.objectContaining({
                outcome: 'success',
                targetId: minted.id,
                metadata: { credential: expect.stringMatching(/^[A-Za-z0-9_-]+$/u) }
            })
        ]);
    });
});

describe('revoking everything a person minted', () => {
    it('audits it as the system’s act, with how many and why, and mails the owner in their language', async () => {
        const user = await createRealUser('compromised', 'it');
        const context = contextFor(String(user._id));
        await mintKey(context, 'one');
        await mintKey(context, 'two');
        mockOutbox.length = 0;

        await emitDomainEvent(ACCOUNT_SESSIONS_REVOKED, {
            userId: String(user._id),
            reason: 'logout-all'
        });

        expect(auditedAs(apiKeysAuditActions.SYSTEM_API_KEYS_REVOKED_ON_COMPROMISE)).toEqual([
            expect.objectContaining({
                outcome: 'success',
                targetType: 'user',
                targetId: String(user._id),
                metadata: { count: 2, reason: 'logout-all' }
            })
        ]);
        const mail = mockOutbox.find(({ template }) => template === 'api-keys.revoked');
        expect(mail?.to).toBe('compromised@example.com');
        expect(mail?.data.locale).toBe('it');
        expect(String(mail?.data.list)).toMatch(
            /^one \(.+\), two \(.+\)$|^two \(.+\), one \(.+\)$/u
        );
    });

    it('still revokes when the owner cannot be looked up', async () => {
        const user = await createRealUser('revoke-lookup-fails');
        const context = contextFor(String(user._id));
        await mintKey(context);
        jest.spyOn(userService, 'getById').mockRejectedValue(new Error('db down'));
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

        await emitDomainEvent(ACCOUNT_SESSIONS_REVOKED, {
            userId: String(user._id),
            reason: 'password-reset'
        });

        expect(warn).toHaveBeenCalledTimes(1);
        expect(mockOutbox.filter(({ template }) => template === 'api-keys.revoked')).toHaveLength(
            0
        );
    });
});

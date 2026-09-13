/**
 * The two halves of "a credential holds a subset of the minter's permissions, never more":
 * enforced at MINT time (`services/api-keys.ts#isMintable`, against what the request's own caller
 * holds) and RE-CHECKED at every subsequent USE (`module.ts`'s `CredentialResolver`, against what
 * the minter holds NOW) — a mocked repository can prove the first; only a real database, a real
 * role change and the real `resolveCredential` path can prove the second actually re-reads rather
 * than trusting the snapshot it minted.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { TEST_TENANT_ID } from '@tests/callers';
import type { TenantCallerContext } from '@infrastructure/http/request';
import { userRepository } from '@modules/users';
import { seedPresetRoles } from '@kernel/access/seed';
import { assignRole } from '@kernel/access/store';
import { permissionsOfRole } from '@kernel/permissions';
import { resolveCredential } from '@kernel/authentication';
// `module.ts`'s side effect (`registerCredentialResolver`) is what makes `resolveCredential`
// answer anything at all — importing the module is what a real boot does.
import '@modules/api-keys/module';
import { mint, revoke } from '@modules/api-keys/services/api-keys';
import { apiKeyRepository } from '@modules/api-keys/repository';
import { mintApiKey } from '@modules/api-keys/credentials';

setupTestDb();

/** A real, persisted user this suite can change the ROLE of between mint and use. */
const createRealUser = (id: string) =>
    userRepository.create({
        email: `${id}@example.com`,
        username: id
    });

/** The `CallerContext` a mint call needs — a real user's id, with whatever permissions they currently hold. */
const contextFor = (userId: string, permissions: readonly string[]): TenantCallerContext => ({
    caller: {
        id: userId,
        tenantId: TEST_TENANT_ID,
        scope: 'tenant',
        permissions
    },
    analyticsConsent: false
});

beforeEach(() => seedPresetRoles());

describe('mint — the subset boundary', () => {
    it('refuses a permission the caller does not hold', async () => {
        const user = await createRealUser('mint-under');
        const context = contextFor(String(user._id), ['apikeys.read']);

        const result = await mint(
            { name: 'partner integration', permissions: ['apikeys.read', 'orders.manage'] },
            context
        );

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable — asserted above');
        expect(result.status).toBe(422);
    });

    it('mints when every requested key is held, and returns the plaintext once', async () => {
        const user = await createRealUser('mint-ok');
        const context = contextFor(String(user._id), ['apikeys.read', 'apikeys.manage']);

        const result = await mint(
            { name: 'partner integration', permissions: ['apikeys.read'] },
            context
        );

        expect(result.success).toBe(true);
        if (!result.data) throw new Error('unreachable — asserted above');
        expect(result.data.secret.startsWith('sk_')).toBe(true);
        expect(result.data.permissions).toEqual(['apikeys.read']);
    });

    it('lets a wildcard-holder mint a key naming one specific key beneath it', async () => {
        const user = await createRealUser('mint-wildcard');
        const context = contextFor(String(user._id), permissionsOfRole('owner'));

        const result = await mint({ name: 'from owner', permissions: ['orders.read'] }, context);

        expect(result.success).toBe(true);
    });
});

describe('the credential-resolve path — re-floored at every use, not just at mint', () => {
    it("shrinks a key's reach the moment its minter is demoted, with the document never touched", async () => {
        const user = await createRealUser('demoted-minter');
        const userId = String(user._id);
        await assignRole(userId, TEST_TENANT_ID, 'tenant', 'owner');

        const mintContext = contextFor(userId, permissionsOfRole('owner'));
        const minted = await mint(
            { name: 'about to be demoted', permissions: ['apikeys.read'] },
            mintContext
        );
        if (!minted.data) throw new Error('setup failed: mint was refused');

        const beforeDemotion = await resolveCredential(minted.data.secret);
        expect(beforeDemotion?.caller.permissions).toContain('apikeys.read');

        // `customer` holds none of the api-keys keys — the demotion this test is about.
        await assignRole(userId, TEST_TENANT_ID, 'tenant', 'customer');

        const afterDemotion = await resolveCredential(minted.data.secret);
        // Still a real, resolvable credential (not revoked, not expired) — just holding nothing
        // now, which is the point: the DOCUMENT never changed, only what it re-floors against did.
        expect(afterDemotion?.caller.permissions).not.toContain('apikeys.read');
    });

    it('carries the credential id for the audit trail, display-shaped, never the secret', async () => {
        const user = await createRealUser('display-id');
        const context = contextFor(String(user._id), ['apikeys.read']);
        const minted = await mint({ name: 'named', permissions: ['apikeys.read'] }, context);
        if (!minted.data) throw new Error('setup failed: mint was refused');

        const resolved = await resolveCredential(minted.data.secret);

        expect(resolved?.credentialId).toBe(`sk_${minted.data.publicPrefix}`);
        expect(resolved?.credentialId).not.toContain(minted.data.secret);
    });
});

describe('revoke', () => {
    it('makes the credential unresolvable immediately', async () => {
        const user = await createRealUser('to-revoke');
        const context = contextFor(String(user._id), ['apikeys.read']);
        const minted = await mint({ name: 'short-lived', permissions: ['apikeys.read'] }, context);
        if (!minted.data) throw new Error('setup failed: mint was refused');

        await revoke(minted.data.id, context);

        expect(await resolveCredential(minted.data.secret)).toBeUndefined();
    });

    it('is idempotent — revoking an already-revoked key still succeeds', async () => {
        const user = await createRealUser('double-revoke');
        const context = contextFor(String(user._id), ['apikeys.read']);
        const minted = await mint({ name: 'short-lived', permissions: ['apikeys.read'] }, context);
        if (!minted.data) throw new Error('setup failed: mint was refused');

        await revoke(minted.data.id, context);
        const second = await revoke(minted.data.id, context);

        expect(second.success).toBe(true);
    });
});

describe('an expired credential', () => {
    it('is unresolvable past its expiry, with no revoke needed', async () => {
        const { plaintext, publicPrefix, hash } = mintApiKey();
        await apiKeyRepository.create({
            tenant: TEST_TENANT_ID,
            name: 'already expired',
            publicPrefix,
            hash,
            permissions: ['apikeys.read'],
            createdByUserId: 'irrelevant-for-this-check',
            expiresAt: new Date(Date.now() - 1000)
        } as never);

        expect(await resolveCredential(plaintext)).toBeUndefined();
    });
});

describe('touchLastUsed', () => {
    it('stamps lastUsedAt on the row it names', async () => {
        const { publicPrefix, hash } = mintApiKey();
        const apiKey = await apiKeyRepository.create({
            tenant: TEST_TENANT_ID,
            name: 'freshly minted',
            publicPrefix,
            hash,
            permissions: ['apikeys.read'],
            createdByUserId: 'irrelevant-for-this-check'
        } as never);
        expect(apiKey.lastUsedAt).toBeUndefined();

        await apiKeyRepository.touchLastUsed(String(apiKey._id));

        const reloaded = await apiKeyRepository.findById(String(apiKey._id));
        expect(reloaded?.lastUsedAt).toBeInstanceOf(Date);
    });
});

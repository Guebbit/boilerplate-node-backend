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
import type { TenantCallerContext } from '@types';
import { userRepository } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { assignRole } from '@modules/access';
import { permissionsOfRole } from '@kernel/permissions';
import { resolveCredential } from '@kernel/authentication';
import apiKeysModule from '@modules/api-keys/module';
import { mint, revoke } from '@modules/api-keys/services/api-keys';
import { apiKeyRepository } from '@modules/api-keys/repository';
import { mintApiKey } from '@modules/api-keys/credentials';
import { logger } from '@infrastructure/adapters/logger';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { enabledModules } from '../../../../modules';

setupTestDb();

// `onRegistered`'s `registerCredentialResolver` call is what makes `resolveCredential` answer
// anything at all — running it here is what a real boot does once this module is enabled (D15).
apiKeysModule.onRegistered?.();

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
        permissions,
        unrestricted: false,
        system: false,
        level: 'admin'
    },
    analyticsConsent: false
});

describe('mint — the subset boundary', () => {
    it('refuses a permission the caller does not hold', async () => {
        const user = await createRealUser('mint-under');
        const context = contextFor(String(user._id), ['apikeys.any.read']);

        const result = await mint(
            { name: 'partner integration', permissions: ['apikeys.any.read', 'orders.any.read'] },
            context
        );

        expect(result.success).toBe(false);
        if (result.success) throw new Error('unreachable — asserted above');
        expect(result.status).toBe(422);
    });

    it('mints when every requested key is held, and returns the plaintext once', async () => {
        const user = await createRealUser('mint-ok');
        const context = contextFor(String(user._id), ['apikeys.any.read', 'apikeys.any.create']);

        const result = await mint(
            { name: 'partner integration', permissions: ['apikeys.any.read'] },
            context
        );

        expect(result.success).toBe(true);
        if (!result.data) throw new Error('unreachable — asserted above');
        expect(result.data.secret.startsWith('sk_')).toBe(true);
        expect(result.data.permissions).toEqual(['apikeys.any.read']);
    });

    it('lets a wildcard-holder mint a key naming one specific key beneath it', async () => {
        const user = await createRealUser('mint-wildcard');
        const context = contextFor(String(user._id), permissionsOfRole('admin'));

        const result = await mint(
            { name: 'from owner', permissions: ['orders.self.read'] },
            context
        );

        expect(result.success).toBe(true);
    });
});

describe('a self key is not an any key', () => {
    // `orders.self.read` and `orders.any.read` are both `read` on `Order`: CASL cannot tell them
    // apart, the literal keys can.
    it('refuses to mint orders.any.read for a minter who holds only orders.self.read', async () => {
        const user = await createRealUser('self-minter');
        const context = contextFor(String(user._id), permissionsOfRole('customer'));

        const result = await mint({ name: 'wide read', permissions: ['orders.any.read'] }, context);

        expect(result.success).toBe(false);
    });

    it('shrinks a minted orders.any.read to nothing once its minter is a customer', async () => {
        const user = await createRealUser('wide-then-narrow');
        const userId = String(user._id);
        await assignRole(userId, TEST_TENANT_ID, 'tenant', 'admin');
        const minted = await mint(
            { name: 'wide read', permissions: ['orders.any.read'] },
            contextFor(userId, permissionsOfRole('admin'))
        );
        if (!minted.data) throw new Error('setup failed: mint was refused');

        await assignRole(userId, TEST_TENANT_ID, 'tenant', 'customer');

        const resolved = await resolveCredential(minted.data.secret);
        expect(resolved?.caller.permissions).not.toContain('orders.any.read');
    });
});

describe('the credential-resolve path — re-floored at every use, not just at mint', () => {
    it("shrinks a key's reach the moment its minter is demoted, with the document never touched", async () => {
        const user = await createRealUser('demoted-minter');
        const userId = String(user._id);
        await assignRole(userId, TEST_TENANT_ID, 'tenant', 'admin');

        const mintContext = contextFor(userId, permissionsOfRole('admin'));
        const minted = await mint(
            { name: 'about to be demoted', permissions: ['apikeys.any.read'] },
            mintContext
        );
        if (!minted.data) throw new Error('setup failed: mint was refused');

        const beforeDemotion = await resolveCredential(minted.data.secret);
        expect(beforeDemotion?.caller.permissions).toContain('apikeys.any.read');
        // A key acts at its minter's level — what the rank rule compares.
        expect(beforeDemotion?.caller.level).toBe('admin');

        // `customer` holds none of the api-keys keys — the demotion this test is about.
        await assignRole(userId, TEST_TENANT_ID, 'tenant', 'customer');

        const afterDemotion = await resolveCredential(minted.data.secret);
        // Still a real, resolvable credential (not revoked, not expired) — just holding nothing
        // now, which is the point: the DOCUMENT never changed, only what it re-floors against did.
        expect(afterDemotion?.caller.permissions).not.toContain('apikeys.any.read');
        // ...and its level follows the minter down, so a demoted admin's key no longer outranks.
        expect(afterDemotion?.caller.level).toBe('user');
    });

    // The minter's deactivation is the only way to switch a key off without touching it: an
    // administrator cannot ban another administrator, so this is what a hand edit of the account
    // (the technician's door) does to every key that account minted.
    it('holds nothing for a key whose minter was deactivated, and the key itself is untouched', async () => {
        const user = await createRealUser('banned-minter');
        const userId = String(user._id);
        await assignRole(userId, TEST_TENANT_ID, 'tenant', 'admin');
        const minted = await mint(
            { name: 'about to lose its minter', permissions: ['apikeys.any.read'] },
            contextFor(userId, permissionsOfRole('admin'))
        );
        if (!minted.data) throw new Error('setup failed: mint was refused');
        const before = await resolveCredential(minted.data.secret);

        await userRepository.updateMany({ _id: userId }, { active: false });
        const after = await resolveCredential(minted.data.secret);
        const stored = await apiKeyRepository.findById(minted.data.id);

        expect(before?.caller.permissions).toContain('apikeys.any.read');
        // Still recognised (the guest's floor, not a refusal at the door), holding none of the minter's keys.
        expect(after?.caller.permissions).not.toContain('apikeys.any.read');
        expect(after?.caller.permissions.every((key) => key.endsWith('.read'))).toBe(true);
        expect(stored?.revokedAt).toBeUndefined();
    });

    it('carries the credential id for the audit trail, display-shaped, never the secret', async () => {
        const user = await createRealUser('display-id');
        const context = contextFor(String(user._id), ['apikeys.any.read']);
        const minted = await mint({ name: 'named', permissions: ['apikeys.any.read'] }, context);
        if (!minted.data) throw new Error('setup failed: mint was refused');

        const resolved = await resolveCredential(minted.data.secret);

        expect(resolved?.credentialId).toBe(`sk_${minted.data.publicPrefix}`);
        expect(resolved?.credentialId).not.toContain(minted.data.secret);
    });
});

describe('revoke', () => {
    it('makes the credential unresolvable immediately', async () => {
        const user = await createRealUser('to-revoke');
        const context = contextFor(String(user._id), ['apikeys.any.read']);
        const minted = await mint(
            { name: 'short-lived', permissions: ['apikeys.any.read'] },
            context
        );
        if (!minted.data) throw new Error('setup failed: mint was refused');

        await revoke(minted.data.id, context);

        expect(await resolveCredential(minted.data.secret)).toBeUndefined();
    });

    it('is idempotent — revoking an already-revoked key still succeeds', async () => {
        const user = await createRealUser('double-revoke');
        const context = contextFor(String(user._id), ['apikeys.any.read']);
        const minted = await mint(
            { name: 'short-lived', permissions: ['apikeys.any.read'] },
            context
        );
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
            permissions: ['apikeys.any.read'],
            createdByUserId: 'irrelevant-for-this-check',
            expiresAt: new Date(Date.now() - 1000)
        });

        expect(await resolveCredential(plaintext)).toBeUndefined();
    });
});

describe('a hard-deleted user takes their credentials with them', () => {
    // `subscribe()` (this listener) and `onRegistered` (the credential resolver, D15) are both
    // manifest hooks that only run through `registerModules` — the top-level `import
    // '@modules/api-keys/module'` above installs neither by itself, same reasoning as
    // `wishlist/tests/integration/service.test.ts`.
    beforeEach(() => {
        resetDomainEvents();
        registerModules(enabledModules);
    });

    it('erases every credential the user minted', async () => {
        const user = await createRealUser('erased-owner');
        const context = contextFor(String(user._id), ['apikeys.any.read', 'apikeys.any.create']);
        const first = await mint({ name: 'first', permissions: ['apikeys.any.read'] }, context);
        const second = await mint({ name: 'second', permissions: ['apikeys.any.read'] }, context);
        if (!first.data || !second.data) throw new Error('setup failed: mint was refused');

        await userService.removeById(String(user._id), true);

        expect(await resolveCredential(first.data.secret)).toBeUndefined();
        expect(await resolveCredential(second.data.secret)).toBeUndefined();
        expect(await apiKeyRepository.findById(first.data.id)).toBeNull();
        expect(await apiKeyRepository.findById(second.data.id)).toBeNull();
    });

    it('leaves another user unaffected', async () => {
        const doomed = await createRealUser('erased-alice');
        const kept = await createRealUser('kept-bob');
        const doomedContext = contextFor(String(doomed._id), ['apikeys.any.read']);
        const keptContext = contextFor(String(kept._id), ['apikeys.any.read']);
        await mint({ name: 'about to go', permissions: ['apikeys.any.read'] }, doomedContext);
        const survivor = await mint(
            { name: 'stays', permissions: ['apikeys.any.read'] },
            keptContext
        );
        if (!survivor.data) throw new Error('setup failed: mint was refused');

        await userService.removeById(String(doomed._id), true);

        expect(await apiKeyRepository.findById(survivor.data.id)).not.toBeNull();
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
            permissions: ['apikeys.any.read'],
            createdByUserId: 'irrelevant-for-this-check'
        });
        expect(apiKey.lastUsedAt).toBeUndefined();

        await apiKeyRepository.touchLastUsed(String(apiKey._id));

        const reloaded = await apiKeyRepository.findById(String(apiKey._id));
        expect(reloaded?.lastUsedAt).toBeInstanceOf(Date);
    });

    /*
     * `module.ts`'s `fromBearerToken` fires this fire-and-forget (`void
     * apiKeyRepository.touchLastUsed(...)`, by design — see the repository's own doc comment) with
     * no `.catch`. A rejection there had nobody left to see it; logged instead, so a failed stamp
     * is visible without costing the resolve it rides on.
     */
    it('logs a warning and still resolves the credential when the stamp write fails', async () => {
        const user = await createRealUser('touch-fails');
        const userId = String(user._id);
        // Resolve re-floors against what the minter holds NOW (`currentCallerOf`), not the mint
        // context's own claimed permissions — needs a real membership row, same as the
        // demoted-minter case above.
        await assignRole(userId, TEST_TENANT_ID, 'tenant', 'admin');
        const context = contextFor(userId, ['apikeys.any.read']);
        const minted = await mint(
            { name: 'about to fail its touch', permissions: ['apikeys.any.read'] },
            context
        );
        if (!minted.data) throw new Error('setup failed: mint was refused');
        const loggedWarn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
        jest.spyOn(apiKeyRepository, 'touchLastUsed').mockRejectedValueOnce(
            new Error('write conflict')
        );

        const resolved = await resolveCredential(minted.data.secret);

        expect(resolved?.caller.permissions).toContain('apikeys.any.read');
        // Fire-and-forget: give the rejected touch's own microtask a turn before asserting the log.
        await Promise.resolve();
        expect(loggedWarn).toHaveBeenCalledWith(
            expect.objectContaining({ apiKeyId: minted.data.id })
        );
    });
});

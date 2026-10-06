/**
 * @module
 * Repository for `apikeys`, plus the one query the generic factory has no shape for: the
 * credential-resolve path's own lookup, which must filter revoked/expired rows AT THE QUERY —
 * see {@link findActiveByPrefix}.
 */

import type { ClientSession } from 'mongoose';
import { createRepository, type Repository } from '@infrastructure/persistence/create-repository';
import { apiKeyModel, applyApiKeyTransform, type ApiKeyDocument } from './model';
import type { ApiKey } from '@types';

/** The shared factory's CRUD, scoped to `apikeys`. No `searchable`: the admin list has no free-text filter. */
const base = createRepository<ApiKeyDocument, ApiKey>(apiKeyModel, {
    transform: applyApiKeyTransform
});

/**
 * The one active credential named by this prefix, or `null`.
 *
 * Filters `revokedAt`/`expiresAt` here rather than after the fetch: a revoked or expired key must
 * fail lookup exactly like one that was never minted, not need a second check downstream that a
 * future caller could forget. `{ revokedAt: null }` matches both an explicitly-null and an absent
 * field — Mongo's own equality semantics — so an un-revoked row (the field was never set) matches
 * without a second `$exists` clause.
 *
 * @param publicPrefix - the credential's public, non-secret prefix — see `./credentials`
 */
const findActiveByPrefix = (publicPrefix: string): Promise<ApiKeyDocument | null> =>
    apiKeyModel
        .findOne({
            publicPrefix,
            revokedAt: null,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
        })
        .exec();

/**
 * Stamp `lastUsedAt` — fire-and-forget from the credential-resolve path, never awaited there: a
 * request authenticating with a key must not pay for this write's latency, and a lost update
 * (a crash between resolve and this landing) costs nothing more than a stale "last used" reading.
 */
const touchLastUsed = (id: string): Promise<void> =>
    apiKeyModel
        .updateOne({ _id: id }, { $set: { lastUsedAt: new Date() } })
        .exec()
        .then(() => undefined);

/**
 * Delete every credential this user minted — what a hard account deletion owes this collection.
 * `createdByUserId` is stored as a plain string (never `toObjectId`d — see `./model`), so it's
 * matched as-is.
 */
const deleteByUserId = (userId: string, session?: ClientSession): Promise<void> =>
    apiKeyModel
        .deleteMany({ createdByUserId: userId }, session ? { session } : undefined)
        .exec()
        .then(() => {
            // explicit void return
        });

/**
 * Every credential this user minted that is still live — not revoked. An expired one is left out:
 * it is already dead, and listing it in a "these were revoked" notice would be untrue.
 *
 * @param userId - the minter
 */
const findActiveByMinter = (userId: string): Promise<ApiKeyDocument[]> =>
    apiKeyModel
        .find({
            createdByUserId: userId,
            revokedAt: null,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
        })
        .exec();

/**
 * Revoke these credentials at `at`, skipping any a concurrent request already revoked, so a key's
 * `revokedAt` is the first moment it died and never moves.
 *
 * @param ids - the credentials' ids
 * @param at - the revocation time
 */
const revokeMany = (ids: readonly string[], at: Date): Promise<void> =>
    apiKeyModel
        .updateMany({ _id: { $in: ids }, revokedAt: null }, { $set: { revokedAt: at } })
        .exec()
        .then(() => undefined);

/** Explicit annotation: same TS7056 reason as every other module's repository — see `webhooks/repository.ts`. */
export const apiKeyRepository: Repository<ApiKeyDocument, ApiKey> & {
    findActiveByPrefix: typeof findActiveByPrefix;
    touchLastUsed: typeof touchLastUsed;
    deleteByUserId: typeof deleteByUserId;
    findActiveByMinter: typeof findActiveByMinter;
    revokeMany: typeof revokeMany;
} = {
    ...base,
    findActiveByPrefix,
    touchLastUsed,
    deleteByUserId,
    findActiveByMinter,
    revokeMany
};

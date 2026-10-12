/**
 * @module
 * The user collection's persistence layer: standard CRUD from the repository factory, plus the
 * credential and token operations `account` needs from the other side of the shared-kernel edge.
 *
 * See: docs/modules/users.md
 */

import {
    reencryptOf,
    type ReencryptSpec,
    type ReencryptReport
} from '@infrastructure/security/reencrypt';
import { AUTHENTICATABLE_FILTER } from './authenticatable';
import { twoFactorWritePipeline, type TwoFactorWrite } from './two-factor-write';
import { userModel, applyUserTransform } from './model';
import type { UserDocument, OAuthAccount, UserWire, MfaReservation } from './model';
import type { UpdateQuery, QueryFilter, UpdateWriteOpResult, ClientSession } from 'mongoose';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import type { ImageWriteback } from '@infrastructure/adapters/image.worker';

/**
 * `password`, the 2FA secret fields, `reauthCode`, `oauthAccounts` and `pendingEmail` are
 * `select: false` on the schema, so plain finders never load them. These two helpers are the ONLY
 * sanctioned way to get them back, keeping re-selection in one place instead of scattered
 * `.select('+password')` calls.
 */
const CREDENTIAL_FIELDS =
    '+password +twoFactorMethods +twoFactorBackupCodes +twoFactorBackupCodeSalt +reauthCode +oauthAccounts +pendingEmail +previousEmail';

/**
 * A user's last proof of life, as an aggregation `$expr`: `lastActiveAt` (stamped on every session
 * mint and refresh, see `touchLastActive`), `lastApiKeyUseAt` (a key the account minted was used,
 * see `touchApiKeyUse`), or `createdAt` for an account that never signed in.
 * `$max` ignores a missing field. Shared by every `findInactive*` query below so "how recently was
 * this account used" is answered once rather than reimplemented per query and drifting.
 */
const LAST_ACTIVE_EXPR = { $max: ['$lastActiveAt', '$lastApiKeyUseAt', '$createdAt'] };

/** One day in milliseconds: the throttle of the activity stamp. */
const ACTIVITY_THROTTLE_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the reaper has not yet warned an account for its CURRENT stretch of inactivity: never
 * warned, or active again since the warning. The second half is what lets a returning user be
 * warned again later without a write on login.
 */
const NOT_WARNED_THIS_STRETCH = {
    $or: [
        { $eq: [{ $type: '$inactivityWarnedAt' }, 'missing'] },
        { $gt: [LAST_ACTIVE_EXPR, '$inactivityWarnedAt'] }
    ]
};

/**
 * Standard CRUD via the repository factory, plus credential reads and soft-delete scoping. The
 * type is written out because Mongoose's generics are too large for TypeScript to serialize an
 * inferred one at an export boundary (TS7056) — the same reason `Repository` exists.
 */
export const userRepository: Repository<UserDocument, UserWire> & {
    reencrypt: (spec: ReencryptSpec<UserDocument>, dryRun?: boolean) => Promise<ReencryptReport>;
    updateMany: (
        filter: QueryFilter<UserDocument>,
        update: UpdateQuery<UserDocument>
    ) => Promise<UpdateWriteOpResult>;
    findByIdWithCredentials: (id: string) => Promise<UserDocument | null>;
    findOneWithCredentials: (where: QueryFilter<UserDocument>) => Promise<UserDocument | null>;
    findByIdWithPendingEmail: (id: string) => Promise<UserDocument | null>;
    emailOrPendingEmailTaken: (email: string, excludingId: string) => Promise<boolean>;
    findAuthenticatableById: (id: string) => Promise<UserDocument | null>;
    findAuthenticatableByEmail: (email: string) => Promise<UserDocument | null>;
    clearLapsedPreviousEmail: (keepUserIds: readonly string[]) => Promise<number>;
    linkOAuthAccount: (userId: string, account: OAuthAccount) => Promise<boolean>;
    unlinkOAuthAccount: (userId: string, provider: string) => Promise<boolean>;
    reserveMfaAttempt: (id: string, maxFailures: number, lockMs: number) => Promise<MfaReservation>;
    resetMfaAttempts: (id: string) => Promise<void>;
    bumpSessionEpoch: (id: string, at: Date, session?: ClientSession) => Promise<void>;
    claimTotpStep: (id: string, method: string, step: number) => Promise<boolean>;
    writeTwoFactor: (id: string, write: TwoFactorWrite) => Promise<boolean>;
    writebackImage: ImageWriteback;
    touchLastActive: (id: string, now: Date) => Promise<void>;
    touchApiKeyUse: (id: string, now: Date) => Promise<void>;
    markInactivityMinimised: (id: string, at: Date) => Promise<void>;
    findInactiveUnminimised: (cutoff: Date) => Promise<UserDocument[]>;
    findInactiveUnwarned: (cutoff: Date) => Promise<UserDocument[]>;
    findWarnedStillInactive: (warnedBefore: Date) => Promise<UserDocument[]>;
    findReaperSoftDeletedPastGrace: (cutoff: Date) => Promise<UserDocument[]>;
} = {
    reencrypt: reencryptOf(userModel),
    ...createRepository<UserDocument, UserWire>(userModel, {
        transform: applyUserTransform,
        searchable: {
            objectIds: { id: '_id' },
            text: ['email', 'username'],
            regex: { email: 'email', username: 'username' },
            /*
             * `active` filters the real column, not `deletedAt: { $exists: … }`: "show me
             * deactivated accounts" and "show me deleted accounts" are different questions.
             */
            // No `role` filter here: the document carries no `role` column to match against —
            // see `@modules/access`. Filtering a search by role needs a two-step resolve
            // (membership rows holding that role, then the users among those ids) that this
            // generic `exact` filter can't express; deliberately not rebuilt yet.
            booleans: { active: 'active' },
            presence: { deleted: 'deletedAt' },
            sortable: { createdAt: 'createdAt', email: 'email', username: 'username' }
        }
    }),

    /**
     * Update multiple user documents matching the filter.
     */
    updateMany: (filter: QueryFilter<UserDocument>, update: UpdateQuery<UserDocument>) =>
        userModel.updateMany(filter, update).exec(),

    /**
     * Fetch a user by id WITH its credential fields. Use only where they are actually needed.
     */
    findByIdWithCredentials: (id: string) =>
        userModel.findById(id).select(CREDENTIAL_FIELDS).exec(),

    /**
     * Fetch the first user matching the filter WITH its credential fields.
     */
    findOneWithCredentials: (where: QueryFilter<UserDocument>) =>
        userModel.findOne(where).select(CREDENTIAL_FIELDS).exec(),

    /**
     * Fetch a user by id WITH `pendingEmail` — for the caller's own profile
     * (`GET /account`), which shows a pending change as a banner but has no other use for
     * `password`/2FA material, unlike {@link findByIdWithCredentials}'s callers.
     */
    findByIdWithPendingEmail: (id: string) => userModel.findById(id).select('+pendingEmail').exec(),

    /**
     * Whether `email` already backs another account — either its proven `email`, or another
     * account's `pendingEmail` in flight. The REQUEST-TIME half of the collision rule in
     * docs/modules/account.md#proving-an-address; `users_pending_email` and `users_email` (both
     * unique) are the swap-time half, since this read and the eventual swap are up to 24 hours
     * apart and only the indexes are still there for both.
     * @param email - the address being requested
     * @param excludingId - the caller's own id, so re-requesting the address already pending for
     *   THEM doesn't read as a collision
     */
    emailOrPendingEmailTaken: (email: string, excludingId: string) =>
        userModel
            .exists({
                _id: { $ne: toObjectId(excludingId) },
                $or: [{ email }, { pendingEmail: email }]
            })
            .then((match) => match !== null),

    /**
     * Fetch a user by id, but only if the account may still authenticate — `active` is not
     * `false` and `deletedAt` is unset. The narrower sibling of `findById`: `resolve()` in
     * `account/module.ts` is the only caller, since every OTHER `findById` call in the codebase
     * deliberately needs the unscoped read (a deactivated account in the admin panel, a payer who
     * no longer exists, historical work attached to a gone user). Named for the question it
     * answers, like `findByIdWithCredentials`.
     */
    findAuthenticatableById: (id: string) =>
        // `id` as given: Mongoose casts it and a malformed one rejects (a client error upstream),
        // where `toObjectId` would throw before any promise exists.
        userModel.findOne({ _id: id, ...AUTHENTICATABLE_FILTER }).exec(),

    /**
     * Fetch a user by email, but only if the account may still authenticate — same
     * `AUTHENTICATABLE_FILTER` as `findAuthenticatableById`. WITH credential fields
     * (`select: false`), since the caller is always about to compare a password hash.
     * `login` (`account/services/login.ts`) is the only caller.
     */
    findAuthenticatableByEmail: (email: string) =>
        userModel
            .findOne({ email, ...AUTHENTICATABLE_FILTER })
            .select(CREDENTIAL_FIELDS)
            .exec(),

    /**
     * Forget the previous address of every account whose undo window has closed: it holds a
     * `previousEmail` and is not among the accounts whose undo link is still live. The address is
     * only there for that link, so keeping it past the link is personal data kept for nothing.
     * Nightly job only: an unindexed whole-collection `updateMany`.
     *
     * @param keepUserIds - the accounts whose undo link still works; passed in because the links
     *   belong to `account`, which this module may not import.
     * @returns how many accounts were cleared
     */
    clearLapsedPreviousEmail: (keepUserIds: readonly string[]) =>
        userModel
            .updateMany(
                {
                    previousEmail: { $exists: true },
                    _id: { $nin: keepUserIds.map((id) => toObjectId(id)) }
                },
                { $unset: { previousEmail: '' } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount),

    /**
     * Link a provider identity to an account — atomic `$push`, never read-modify-write, same rule
     * every array write here follows: `oauthAccounts` is `select: false`, so the document
     * `account/services/oauth.ts` already holds never carries the array to mutate in place.
     *
     * The link vouches for NOTHING: it never sets `verifiedAt` or promotes `unverified` on the
     * provider's word alone — that would be exactly the account-takeover vector this repo
     * refuses. `loginOrCreateFromOAuth` only ever reaches here for an account that already proved
     * the address itself, so there is nothing left for a second write to promote.
     */
    linkOAuthAccount: (userId: string, account: OAuthAccount) =>
        userModel
            .updateOne(
                // One entry per provider: a link for a provider the account already holds matches
                // nothing, so a repeated callback cannot grow the array.
                { _id: toObjectId(userId), 'oauthAccounts.provider': { $ne: account.provider } },
                { $push: { oauthAccounts: account } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * Remove the link to one provider — atomic `$pull`, the mirror of {@link linkOAuthAccount} and
     * for the same reason: `oauthAccounts` is `select: false`, so there is no loaded array to
     * filter. `timestamps: false`: disconnecting a provider is not an edit of the profile.
     *
     * @param provider - the registry name to disconnect
     * @returns whether a link was actually removed (false: it was never linked)
     */
    unlinkOAuthAccount: (userId: string, provider: string) =>
        userModel
            .updateOne(
                { _id: toObjectId(userId) },
                { $pull: { oauthAccounts: { provider } } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * Reserve one wrong-code attempt BEFORE the code is compared, in a single atomic write.
     *
     * Reserve-then-check, not check-then-`$inc`: with a read in between, N parallel guesses all read
     * "under the cap" and all get compared. Here the filter refuses a locked account outright (no
     * matching document: the caller must not compare anything), and the pipeline `$set`s count and
     * lock together, so the 10th reservation is the last one any window can hand out.
     * An expired lock restarts the count from zero in the same write.
     * A right code gives its reservation back through `resetMfaAttempts`.
     * `timestamps: false` — a guess is not an edit.
     *
     * @param id - the account
     * @param maxFailures - reservations a window may hand out before it locks
     * @param lockMs - how long the lock lasts
     */
    reserveMfaAttempt: (id: string, maxFailures: number, lockMs: number) => {
        const now = new Date();
        return (
            userModel
                // https://mongoosejs.com/docs/api/model.html#Model.findOneAndUpdate()
                .findOneAndUpdate(
                    {
                        _id: toObjectId(id),
                        $or: [{ mfaLockedUntil: null }, { mfaLockedUntil: { $lte: now } }]
                    },
                    [
                        {
                            $set: {
                                mfaFailures: {
                                    $add: [
                                        {
                                            // A date here is an EXPIRED lock (the filter admits no other).
                                            $cond: [
                                                { $eq: [{ $type: '$mfaLockedUntil' }, 'date'] },
                                                0,
                                                { $ifNull: ['$mfaFailures', 0] }
                                            ]
                                        },
                                        1
                                    ]
                                }
                            }
                        },
                        {
                            $set: {
                                mfaLockedUntil: {
                                    $cond: [
                                        { $gte: ['$mfaFailures', maxFailures] },
                                        new Date(now.getTime() + lockMs),
                                        '$$REMOVE'
                                    ]
                                }
                            }
                        }
                    ],
                    // `updatePipeline`: Mongoose refuses an array update without it.
                    { returnDocument: 'after', timestamps: false, updatePipeline: true }
                )
                .exec()
                .then((document) => ({
                    reserved: document !== null,
                    lockedNow: (document?.mfaFailures ?? 0) >= maxFailures
                }))
        );
    },

    /**
     * Clear the counter and any lock — a right code, or a completed password reset. Conditional,
     * so the overwhelmingly common clean login writes nothing. `timestamps: false`.
     */
    resetMfaAttempts: (id: string) =>
        userModel
            .updateOne(
                {
                    _id: toObjectId(id),
                    $or: [{ mfaFailures: { $gt: 0 } }, { mfaLockedUntil: { $ne: null } }]
                },
                { $set: { mfaFailures: 0 }, $unset: { mfaLockedUntil: '' } },
                { timestamps: false }
            )
            .exec()
            .then(() => undefined),

    /**
     * Move the account's session epoch forward to `at`: every token minted before it stops
     * working. A plain `$set` — and never backwards, so a slow earlier bump cannot undo a later
     * one. `timestamps: false`, since revoking is not an edit of the profile.
     */
    bumpSessionEpoch: (id: string, at: Date, session?: ClientSession) =>
        userModel
            .updateOne(
                {
                    _id: toObjectId(id),
                    $or: [{ tokensValidAfter: null }, { tokensValidAfter: { $lt: at } }]
                },
                { $set: { tokensValidAfter: at } },
                // `session`: the caller's transaction, so the epoch commits with its other writes.
                { timestamps: false, session }
            )
            .exec()
            .then(() => undefined),

    /**
     * Claim a TOTP time step, atomically: only a step LATER than the last accepted one is taken,
     * so two concurrent requests carrying one code cannot both pass. `$elemMatch` keeps both
     * conditions on the same method entry. `timestamps: false`.
     *
     * @param step - the RFC 6238 step the code matched
     * @returns whether THIS call took the step
     */
    claimTotpStep: (id: string, method: string, step: number) =>
        userModel
            .updateOne(
                {
                    _id: toObjectId(id),
                    twoFactorMethods: {
                        $elemMatch: {
                            method,
                            $or: [{ lastUsedStep: null }, { lastUsedStep: { $lt: step } }]
                        }
                    }
                },
                { $set: { 'twoFactorMethods.$.lastUsedStep': step } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * Apply one request's 2FA changes as a single atomic update: per-method field writes, entries
     * added or dropped, and the account-level fields of the same change — see
     * `./two-factor-write.ts` for why this is not a `save()`.
     *
     * `timestamps: false`: a factor's bookkeeping is not an edit of the account, so it neither
     * moves `updatedAt` nor `editRevision` (the same rule `claimTotpStep` follows).
     *
     * @param id - the account
     * @param write - what the request changed, from `planTwoFactorWrite`
     * @returns whether the account still existed to take the write
     */
    writeTwoFactor: (id: string, write: TwoFactorWrite) =>
        userModel
            // `updatePipeline: true` is Mongoose's opt-in to an aggregation-pipeline update:
            // https://mongoosejs.com/docs/api/model.html#Model.updateOne()
            .updateOne({ _id: toObjectId(id) }, twoFactorWritePipeline(write), {
                timestamps: false,
                updatePipeline: true
            })
            .exec()
            .then(({ matchedCount }) => matchedCount > 0),

    /**
     * The image digest pipeline's writeback for the `users` collection — see `ImageTarget` in
     * `kernel/registry.ts`. Conditional on `pendingImageKey` still matching `key`, so a stale or
     * duplicate job delivery can't overwrite a later upload, and a hard-deleted user is a
     * detectable miss rather than a write to nothing. `timestamps: false` — the digest finishing
     * isn't an edit the account holder made.
     */
    writebackImage: (documentId, key, urls) =>
        userModel
            .updateOne(
                { _id: toObjectId(documentId), pendingImageKey: key },
                {
                    $set: { imageUrl: urls.imageUrl, thumbnailUrl: urls.thumbnailUrl },
                    $unset: { pendingImageKey: '' }
                },
                { timestamps: false }
            )
            .exec()
            .then(({ matchedCount }) =>
                // A miss may be a duplicate run of this same job, whose twin already wrote these
                // exact urls: that counts as held, or the caller deletes the live files.
                matchedCount > 0
                    ? true
                    : userModel
                          .exists({ _id: toObjectId(documentId), imageUrl: urls.imageUrl })
                          .exec()
                          .then((held) => held !== null)
            ),

    /**
     * Stamp the account's `lastActiveAt`, at most once a day: the filter matches only an account
     * with no stamp yet or one older than a day, so a busy account costs one write a day.
     * `$max` keeps the stamp from ever moving backwards. `timestamps: false`, since signing in
     * is not an edit of the profile.
     *
     * @param id - the account
     * @param now - the moment to stamp
     */
    touchLastActive: (id: string, now: Date) =>
        userModel
            .updateOne(
                {
                    _id: toObjectId(id),
                    $or: [
                        { lastActiveAt: { $exists: false } },
                        { lastActiveAt: { $lt: new Date(now.getTime() - ACTIVITY_THROTTLE_MS) } }
                    ]
                },
                { $max: { lastActiveAt: now } },
                { timestamps: false }
            )
            .exec()
            .then(() => undefined),

    /**
     * Stamp `lastApiKeyUseAt`, at most once a day — same throttle and same reasons as
     * `touchLastActive`, so a busy key costs one user write a day, not one per request.
     *
     * @param id - the account that minted the key
     * @param now - the moment to stamp
     */
    touchApiKeyUse: (id: string, now: Date) =>
        userModel
            .updateOne(
                {
                    _id: toObjectId(id),
                    $or: [
                        { lastApiKeyUseAt: { $exists: false } },
                        { lastApiKeyUseAt: { $lt: new Date(now.getTime() - ACTIVITY_THROTTLE_MS) } }
                    ]
                },
                { $max: { lastApiKeyUseAt: now } },
                { timestamps: false }
            )
            .exec()
            .then(() => undefined),

    /**
     * Stamp that every minimise hook has run for this account. `timestamps: false`: minimising is
     * not an edit of the profile.
     *
     * @param id - the account
     * @param at - the moment to stamp
     */
    markInactivityMinimised: (id: string, at: Date) =>
        userModel
            .updateOne(
                { _id: toObjectId(id) },
                { $set: { inactivityMinimisedAt: at } },
                { timestamps: false }
            )
            .exec()
            .then(() => undefined),

    /**
     * Every live account quiet since before `cutoff` that has not been minimised for this stretch of
     * inactivity: never minimised, or active again since the last time. Disabled accounts are
     * included — minimising drops data and deletes nothing, so a ban is no reason to keep it.
     *
     * @param cutoff - last activity must be older than this
     */
    findInactiveUnminimised: (cutoff: Date) =>
        userModel
            .find({
                deletedAt: { $exists: false },
                $expr: {
                    $and: [
                        { $lt: [LAST_ACTIVE_EXPR, cutoff] },
                        {
                            $or: [
                                { $eq: [{ $type: '$inactivityMinimisedAt' }, 'missing'] },
                                { $gt: [LAST_ACTIVE_EXPR, '$inactivityMinimisedAt'] }
                            ]
                        }
                    ]
                }
            })
            .exec(),

    /**
     * Every enabled, live account inactive past the warning threshold and not yet warned for this
     * stretch of inactivity — `scripts/ops/reap-inactive-accounts.ts`'s first stage.
     */
    findInactiveUnwarned: (cutoff: Date) =>
        userModel
            .find({
                ...AUTHENTICATABLE_FILTER,
                $expr: { $and: [{ $lt: [LAST_ACTIVE_EXPR, cutoff] }, NOT_WARNED_THIS_STRETCH] }
            })
            .exec(),

    /**
     * Every enabled, live account warned before `warnedBefore` and not active since the warning —
     * the reaper's soft-delete stage. The grace runs from the WARNING, so one run can never warn
     * and soft-delete the same account.
     */
    findWarnedStillInactive: (warnedBefore: Date) =>
        userModel
            .find({
                ...AUTHENTICATABLE_FILTER,
                inactivityWarnedAt: { $lt: warnedBefore },
                $expr: { $lt: [LAST_ACTIVE_EXPR, '$inactivityWarnedAt'] }
            })
            .exec(),

    /** Every enabled account soft-deleted by the reaper before `cutoff` — the hard-delete stage. */
    findReaperSoftDeletedPastGrace: (cutoff: Date) =>
        userModel
            .find({
                active: { $ne: false },
                // `deletedBy` is the explicit marker that THIS reaper made the soft delete: a
                // person's soft delete never carries it, whatever the account's warning history.
                deletedBy: 'reaper',
                deletedAt: { $lt: cutoff }
            })
            .exec()
};

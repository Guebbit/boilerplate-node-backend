/**
 * @module
 * The user record's Mongoose schema — long, and deliberately one
 * file, since splitting would separate the password hash hook from the `select: false` that keeps
 * the hash off every read.
 * See: docs/modules/users.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { hashPassword } from '@infrastructure/security/password-hash';
import { localeConfig } from '@infrastructure/i18n/config';
import { type User } from '@types';
import { revisionPlugin } from '@infrastructure/persistence/revision-plugin';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * The full user record shape backing Mongoose documents. `createdAt`, `updatedAt`, `deletedAt`,
 * `twoFactorEnabledAt` and `verifiedAt` are omitted from the wire `User` contract and redeclared
 * as `Date` below — the contract carries ISO strings, the document carries real dates. `role` is
 * omitted outright: the document holds no role of its own — `@modules/access`'s membership rows
 * are the only place one is stored — so nothing here may read or write it.
 * `./presenter`'s `presentUser` takes the caller's current role as an explicit parameter instead.
 */
export interface UserRecord extends Omit<
    User,
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'
    | 'twoFactorEnabledAt'
    | 'verifiedAt'
    | 'analyticsConsentAt'
    | 'termsAcceptedAt'
    | 'purchaseHold'
    | 'role'
> {
    /**
     * Hashed by the pre-save hook below before it ever reaches Mongo. Absent for an OAuth-only
     * account (`account/services/oauth.ts`'s signup branch) — sign-in then works only through a
     * linked provider, until a future "add a password" flow gives it one.
     */
    password?: string;
    // soft delete
    deletedAt?: Date;

    /**
     * Stamped by `reap:inactive-accounts` when it warns this account about
     * impending removal — never set anywhere else. Absent means "never warned". The soft-delete
     * stage counts its grace from this date; an account active again since is warned afresh.
     */
    inactivityWarnedAt?: Date;

    /**
     * The account's last proof of life: stamped (at most once a day) on every session mint and every
     * refresh. Never on the wire. `LAST_ACTIVE_EXPR` in `./repository` reads it, with `createdAt`
     * as the fallback for an account that never signed in.
     */
    lastActiveAt?: Date;

    /**
     * The last time an API key this account minted was used (stamped at most once a day). Counts as
     * activity in `LAST_ACTIVE_EXPR`, so a key-only account is not mistaken for an idle one. Never
     * on the wire.
     */
    lastApiKeyUseAt?: Date;

    /**
     * Stamped by `reap:inactive-accounts` once every module's `personalData.minimise`
     * hook has run for this account. An account active again since is minimised afresh when it goes
     * quiet again. Never on the wire.
     */
    inactivityMinimisedAt?: Date;

    /**
     * Who soft-deleted the account, when it was not a person: `reaper` marks
     * `reap:inactive-accounts`'s own soft delete, the only thing its hard-delete
     * stage may later erase. Cleared by a restore. Never on the wire.
     */
    deletedBy?: 'reaper';

    /** Every second factor this account has enrolled or half-enrolled — see {@link TwoFactorMethodRecord}. */
    twoFactorMethods: TwoFactorMethodRecord[];

    /**
     * The step-up code mailed to an account with no password, while one is in flight — see
     * `account/services/reauth.ts`. Kept apart from `twoFactorMethods` because it is not a factor:
     * it is never armed, never challenges a login, and is gone the moment the code is spent.
     */
    reauthCode?: DeliveredCodeState;

    /**
     * Wrong-code reservations against an ARMED second factor in the current window — one counter for
     * every place a code is typed. Written only by `reserveMfaAttempt` and `resetMfaAttempts`.
     */
    mfaFailures: number;

    /**
     * The session epoch: a token whose `auth_time` (floored to the second) is older than this is
     * refused, access and refresh alike. Moved by `bumpSessionEpoch` on every event that means
     * "I may be compromised"; absent means no event has ever moved it.
     */
    tokensValidAfter?: Date;

    /** While in the future, no code is compared at all: the account is locked out of 2FA checks. */
    mfaLockedUntil?: Date;

    /** Salted-scrypt digests of unused backup codes — see `account/two-factor/backup-codes.ts`. */
    twoFactorBackupCodes: string[];

    /** The salt `twoFactorBackupCodes` is scrypt'd under — one per account, not one per code. */
    twoFactorBackupCodeSalt?: string;

    /*
     * Redeclared as `Date`, like `ProductDocument` and `OrderDocument`: the contract carries ISO
     * strings, `timestamps: true` writes real `Date`s. This model missed that treatment until a
     * fixture pinning `createdAt: string` surfaced the mismatch.
     */
    createdAt?: Date;
    updatedAt?: Date;

    /** Same ISO-string-vs-`Date` redeclaration as `createdAt`/`updatedAt` above. */
    twoFactorEnabledAt?: Date;

    /**
     * When an authenticator-app (TOTP) factor was first armed, cleared when the last one goes. The
     * flag staff access is gated on: a delivered code (email) is not a second factor for a role
     * that reads customer data. Derived with `twoFactorEnabledAt` in the same write; never on the wire.
     */
    authenticatorEnabledAt?: Date;

    /**
     * When the address was proven, or absent until it is — informational only, see the schema
     * field's own doc comment. Same ISO-string-vs-`Date` redeclaration as `createdAt`/`updatedAt`.
     */
    verifiedAt?: Date | null;

    /** Same ISO-string-vs-`Date` redeclaration; see the schema field. */
    analyticsConsentAt?: Date;

    /** Same ISO-string-vs-`Date` redeclaration; see the schema field. */
    termsAcceptedAt?: Date;

    /**
     * A purchase hold, kept after it ends so its `setAt` still marks where the count of cancellations
     * restarts. Active only while `until` is in the future: read it through `./services/purchase-hold`.
     */
    purchaseHold?: PurchaseHoldRecord;

    /**
     * When staff last lifted a hold: cancellations up to this instant are not counted again. With
     * the hold's own `setAt` it is the "count from here" mark. Never on the wire.
     */
    purchaseHoldResetAt?: Date;

    /** The provider identities linked to this account — see `OAuthAccount` below. */
    oauthAccounts: OAuthAccount[];

    /**
     * An address requested through `PUT /account` but not yet proven — `select: false`, same
     * reasoning as `password`. The account keeps its current, verified `email` until this is
     * confirmed through the `'email-change'` token (`account/services/verification.ts`); absent
     * means no change is pending. See `docs/modules/users.md`.
     */
    pendingEmail?: string;

    /**
     * The address this account held before its last confirmed email change — `select: false`, like
     * `pendingEmail`. What the undo link restores; written by `applyEmailChange`, cleared by the
     * undo, and useless without the one-time undo token that names this account.
     */
    previousEmail?: string;
}

/**
 * A protective pause on checkout. `until` is always stored: for an automatic hold it is the instant
 * the counted cancellations fall back under the limit, for a manual one the date staff chose.
 */
export interface PurchaseHoldRecord {
    until: Date;
    reason: 'repeated_cancellations' | 'staff';
    /** Written for the buyer to read. Absent on an automatic hold. */
    note?: string;
    /** The staff account that set it; absent for the shop's own automatic hold. Never on the wire. */
    setBy?: string;
    setAt: Date;
}

/** The four fields one delivered code occupies — in a method's entry and in `reauthCode` alike. */
export const DELIVERED_CODE_FIELDS = [
    'codeHash',
    'codeExpiresAt',
    'codeSentAt',
    'codeAttempts'
] as const;

/**
 * A delivered one-time code in flight: its digest, its clock and its attempt count. One shape for
 * a second factor's code and for a step-up code alike, so `account/two-factor/delivered-codes.ts`
 * has one set of rules for both.
 */
export interface DeliveredCodeState {
    /** HMAC of the delivered code currently in flight — see `account/two-factor/delivered-codes.ts`. */
    codeHash?: string;

    /** When the code in flight stops being accepted. */
    codeExpiresAt?: Date;

    /** When the code in flight was sent — the anchor the resend cooldown is measured from. */
    codeSentAt?: Date;

    /** Wrong guesses against the code in flight. Past its ceiling the code is burned, not the account. */
    codeAttempts?: number;
}

/**
 * Where a delivered code lives on the account: the step-up code, or one 2FA method's entry.
 * The users door addresses the right fields from this, in one conditional write.
 */
export type DeliveredCodeSlot = { kind: 'reauth' } | { kind: 'method'; method: string };

/**
 * One second factor on an account — armed or still pending confirmation.
 *
 * One shape for every method rather than a per-method collection: `account/two-factor/` decides
 * what a given `method` does with these fields, and a deployment that gains a channel adds a
 * handler, not a migration. `enrolledAt` is what separates a factor that guards logins from one
 * whose setup was abandoned halfway.
 */
export interface TwoFactorMethodRecord extends DeliveredCodeState {
    /** The subdocument id Mongoose assigns; absent until the entry is first written. */
    _id?: Types.ObjectId;

    /** Wire name of the factor — `totp`, `email`. Unique within the array. */
    method: string;

    /** When this factor was armed. Absent means setup started and was never confirmed — login ignores it. */
    enrolledAt?: Date;

    /** A device method's encrypted secret — see `account/two-factor/totp.ts`. Absent for delivered methods. */
    secret?: string;

    /** The RFC 6238 time step of the last code accepted by a device method — replay protection. */
    lastUsedStep?: number;
}

/**
 * What `reserveMfaAttempt` answers: whether a code may be compared at all, and whether THIS
 * reservation is the one that tripped the lock (so exactly one caller mails the owner).
 */
export interface MfaReservation {
    /** False while the account is locked: refuse without comparing anything. */
    reserved: boolean;

    /** True for the single reservation that reached the cap. */
    lockedNow: boolean;
}

/**
 * One linked OAuth/OIDC identity — `account/services/oauth.ts` is the only writer. A user document
 * may hold several (Google AND GitHub on the same account), and `providerId` rather than `email`
 * is the identity key, since a provider's email can change while its subject id never does.
 */
export interface OAuthAccount {
    /** `enabledProviders()`'s registry key — `'google' | 'github' | ...`. */
    provider: string;
    /** The provider's stable subject ("sub") for this identity — never the email. */
    providerId: string;
    /** When this identity was linked to the account. */
    connectedAt: Date;
}

/**
 * The full Mongoose document: `UserRecord` plus instance methods and Document guarantees.
 */
export interface UserDocument extends UserRecord, Document {
    /** String version of _id — provided by Mongoose's Document getter */
    id: string;

    /**
     * Document-only bookkeeping for the image digest pipeline — the quarantine key of an upload
     * still awaiting its digest job, cleared by the writeback once it completes. Never part of the
     * `User` contract, never read by a controller. See `ImageTarget` in `kernel/registry.ts`.
     */
    pendingImageKey?: string;
}

/**
 * User Document model type. Business logic lives in the service and repository layers.
 */
export type UserModel = Model<UserDocument>;

/**
 * The associated data binding a stored phone to its account: a ciphertext copied to another row
 * fails its auth tag. Written, read and re-encrypted under this one spelling, since a typo in any
 * copy makes the phone undecryptable.
 *
 * @param userId - the account's `_id`
 */
export const phoneAad = (userId: string): string => `users:phone:${userId}`;

/**
 * The Mongoose schema for user documents — field-level comments below cover the non-obvious
 * defaults.
 */
export const userSchema = new Schema<UserDocument, UserModel>(
    {
        email: {
            type: String,
            required: true,
            // A backstop, not the real check — the generated `CreateUserBody`/`SignupBody`
            // already validate every parsed body. This covers the
            // one path that skips Zod: `userService.registerFromOAuth` (`account/services/oauth.ts`)
            // writes a provider's own `email` straight through.
            //
            // Loose on purpose — one "@", one "." after it, no whitespace:
            // - rejects only what could never be a real address, never narrows a valid shape;
            // - `[^\s@]` over `\S` in the local/domain parts blocks a second `@` or a
            //   whitespace-free comma-joined address (`a@b.com,evil@c.test`) that `\S+@\S+` would
            //   let through.
            match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            // Mongoose applies both casters before validation and on every `$set`/`$or`/`$in`
            // built against this path, so login, signup, OAuth and admin writes are all covered
            // with no call-site change — `normalizeEmail` (re-exported below, from
            // `@infrastructure/persistence/normalize-email`) covers the in-memory comparisons
            // Mongoose itself can't reach.
            lowercase: true,
            trim: true
        },
        username: {
            type: String,
            required: true
        },
        // `select: false` — never loaded unless a query explicitly asks for it, so even a
        // .lean() read that bypasses applyUserTransform still cannot leak the hash. Use the
        // repository's *WithCredentials helpers to re-select it (see `./repository`).
        // NOT `required`: an OAuth-only signup (`account/services/oauth.ts`) creates a user with none.
        // The pre-save hash hook below already skips absent/unmodified passwords, unaffected.
        password: {
            type: String,
            select: false
        },
        // No default: an account with no image has no field, and the client draws its own
        // placeholder. `imageUrl: null` on an update unsets it.
        imageUrl: {
            type: String
        },
        /*
         * Set together with `imageUrl` by `readUploadedImage` — never independently, and never by
         * a client: `ThumbnailUrl` is `readOnly` on the contract. Absent for a user whose image
         * came from a remote/default url rather than an upload.
         */
        thumbnailUrl: {
            type: String
        },
        /*
         * The quarantine key of an upload still awaiting its digest job — see the matching field
         * on `products/model.ts` for the full rationale, identical here.
         */
        pendingImageKey: {
            type: String
        },
        /**
         * The user's preferred language for work that happens when they're not present — a
         * password-reset email at 3am has no `Accept-Language` header to read from. Set at signup
         * from the negotiated request locale, editable from the user endpoints. Not validated
         * against the supported list, since `getFixedT` falls back per key and a dropped locale
         * must not make an existing user unreadable.
         */
        locale: {
            type: String,
            default: localeConfig().NODE_DEFAULT_LOCALE
        },
        // Self-service profile fields, no format enforced: a phone number's valid shapes vary too
        // widely by country to regex safely, and a website is free text the same way `imageUrl` is.
        phone: {
            type: String
        },
        website: {
            type: String
        },
        /*
         * "Never asked" and "denied" are the same answer for the gate — it is opt-in, so only
         * `true` captures. Read off `AuthContext` (threaded through `resolve()` in
         * `account/module.ts`), never the document directly. No default: `analyticsConsentAt`
         * says whether the choice was ever made, and an unmade one has no value to restate.
         */
        analyticsConsent: {
            type: Boolean
        },
        /*
         * When the choice above was last made or changed — what GDPR Art. 7(1) asks a controller
         * to be able to show. Unset until the account answers once.
         */
        analyticsConsentAt: {
            type: Date
        },
        /*
         * When the account accepted the terms, and which text (`NODE_TERMS_VERSION` then). Set by
         * a signup and by a first sign-in through a provider; left unset for every other creation
         * path (the admin `/users` route, fixtures), which show nobody the terms.
         */
        termsAcceptedAt: {
            type: Date
        },
        termsVersion: {
            type: String
        },
        /*
         * Whether the account is enabled — independent of `deletedAt`, matching `products`:
         * deactivation and soft-delete are separate states that produce the same effect from
         * outside.
         */
        active: {
            type: Boolean,
            default: true
        },
        /*
         * WHEN the address was confirmed via the verify flow, or `null` until it is.
         * Enforcement is the membership role (`unverified` holds no `checkout:Cart`, see
         * `shared/authorization-keys.yaml`) — this is the record of fact, kept separately because
         * the role can be reassigned: the moment an operator grants a staff role to an unproven
         * address, that grant would otherwise be the only evidence the address was never proven.
         * Set by `completeEmailVerification`/`completeEmailChange`/`completePasswordReset` — every
         * route that proves the mailbox — and read by the OAuth link path, which refuses to link
         * onto an account that never proved its own address.
         */
        verifiedAt: {
            type: Date,
            default: null
        },
        /*
         * The address a pending `PUT /account` email change is waiting to prove — see the field's
         * own doc comment on `UserRecord`. `select: false` for the same reason as `password`: an
         * address in flight is as credential-adjacent as a token, not public profile data.
         */
        pendingEmail: {
            type: String,
            select: false,
            // Same casters as `email` above — a pending change must compare and collide the same
            // way the live address does, or a case-only re-send of the current address would look
            // like a real change (see `normalizeEmail`, re-exported below).
            lowercase: true,
            trim: true
        },
        /* The address before the last confirmed change — see the interface field. */
        previousEmail: {
            type: String,
            select: false,
            lowercase: true,
            trim: true
        },
        deletedAt: {
            type: Date
        },
        inactivityWarnedAt: {
            type: Date
        },
        lastActiveAt: {
            type: Date
        },
        lastApiKeyUseAt: {
            type: Date
        },
        inactivityMinimisedAt: {
            type: Date
        },
        deletedBy: {
            type: String,
            enum: ['reaper']
        },
        /* A purchase hold; see {@link PurchaseHoldRecord}. A sub-document, so absent reads as `undefined`. */
        purchaseHold: {
            type: new Schema(
                {
                    until: { type: Date, required: true },
                    reason: {
                        type: String,
                        enum: ['repeated_cancellations', 'staff'],
                        required: true
                    },
                    note: { type: String, maxlength: 500 },
                    setBy: { type: String },
                    setAt: { type: Date, required: true }
                },
                { _id: false }
            )
        },
        purchaseHoldResetAt: {
            type: Date
        },
        /*
         * Two-factor authentication. Asymmetric storage on purpose: a device method's `secret`
         * must be recoverable to recompute a code against, so it is ENCRYPTED
         * (`account/two-factor/totp.ts`), never hashed, while a delivered method's code is only
         * ever compared and so is kept as an HMAC. `select: false` since the login and
         * 2FA-management flows are the only readers.
         */
        twoFactorMethods: {
            type: [
                {
                    method: {
                        type: String,
                        required: true
                    },
                    enrolledAt: {
                        type: Date
                    },
                    secret: {
                        type: String
                    },
                    lastUsedStep: {
                        type: Number
                    },
                    codeHash: {
                        type: String
                    },
                    codeExpiresAt: {
                        type: Date
                    },
                    codeSentAt: {
                        type: Date
                    },
                    codeAttempts: {
                        type: Number
                    }
                }
            ],
            select: false,
            default: []
        },
        /* Wrong 2FA codes reserved in this window; `reserveMfaAttempt` is the only incrementer. */
        mfaFailures: {
            type: Number,
            default: 0
        },
        /* The session epoch — see the interface field. */
        tokensValidAfter: {
            type: Date
        },
        /* End of the 2FA lock, absent when none is set. */
        mfaLockedUntil: {
            type: Date
        },
        /*
         * The step-up code in flight for an account with no password. `select: false` like the
         * 2FA fields: it is credential material, and only the re-auth flow reads it.
         */
        reauthCode: {
            type: new Schema(
                {
                    codeHash: { type: String },
                    codeExpiresAt: { type: Date },
                    codeSentAt: { type: Date },
                    codeAttempts: { type: Number }
                },
                { _id: false }
            ),
            select: false
        },
        /*
         * When the FIRST factor was armed, cleared when the last one goes. Derivable from
         * `twoFactorMethods`, and stored anyway: it is the only 2FA field on the `User` contract,
         * and `postLogin` has to branch on it without loading credentials it has no other use for.
         */
        twoFactorEnabledAt: {
            type: Date
        },
        /* When the first authenticator-app factor was armed; derived like `twoFactorEnabledAt`. */
        authenticatorEnabledAt: {
            type: Date
        },
        /*
         * Recovery codes for a lost authenticator — salted-scrypt digests, not a bare hash: at 40
         * bits each they are short enough for an offline dump to brute-force, so storage carries
         * the strength instead. See `account/two-factor/backup-codes.ts#hashBackupCode`.
         */
        twoFactorBackupCodes: {
            type: [String],
            select: false,
            default: []
        },
        /* The salt every entry in `twoFactorBackupCodes` is scrypt'd under — one per account. */
        twoFactorBackupCodeSalt: {
            type: String,
            select: false
        },
        /*
         * Linked provider identities — `select: false` like `password`, same reasoning: not secret
         * in the credential-theft sense (a `providerId` is useless without the provider's own
         * session), but nothing on the wire needs it by default. Written only through atomic
         * `$push` (`repository.ts#linkOAuthAccount`), never read-modify-write — two concurrent
         * logins linking a second provider must not race each other's write away.
         */
        oauthAccounts: {
            type: [
                {
                    provider: {
                        type: String,
                        required: true
                    },
                    providerId: {
                        type: String,
                        required: true
                    },
                    connectedAt: {
                        type: Date,
                        required: true
                    }
                }
            ],
            select: false,
            default: []
        }
    },
    {
        timestamps: true
    }
);

/**
 * The edit counter behind this resource's `ETag` and `If-Match` — see `@infrastructure/persistence/revision-plugin`.
 */
userSchema.plugin(revisionPlugin);

/*
 * Indexes, declared on the schema so this file is the one place deciding what's indexed. Mongoose
 * creates them on connect, so a new index needs only a line below. Names are given rather than
 * derived, and that's load-bearing: Mongo identifies an index by name as much as by key, so
 * renaming one here makes a database holding the old name fail to boot rather than silently no-op.
 */
/*
 * Login and signup both look up by email. UNIQUE is a correctness constraint, not a performance
 * one: signup is check-then-insert, so two concurrent signups for one address can both read absent
 * and both insert — only the database can refuse the second write. Paired with the E11000 branch
 * in `@infrastructure/http/errors` (409, not 500), and with `npm run db:sync`, which refuses to
 * build the index at all while the collection still holds duplicates. Mongo won't silently upgrade
 * an existing non-unique `users_email`: a database that never synced fails loudly at startup.
 */
userSchema.index({ email: 1 }, { name: 'users_email', unique: true });
/*
 * The OAuth callback's primary lookup: "does this (provider, providerId) pair already exist".
 * UNIQUE for the same reason as `users_email` — the lookup is check-then-insert
 * (`account/services/oauth.ts`), so two callbacks minting the SAME never-before-seen identity
 * concurrently can both read absent and both attempt to create. Only the database can refuse the
 * second write; it surfaces as the same E11000 → 409 path `users_email` already relies on.
 *
 * `partialFilterExpression` is load-bearing, not an optimization: a COMPOUND multikey index over
 * two fields of the SAME array indexes an EMPTY `oauthAccounts` as one `{provider: null,
 * providerId: null}` entry — unlike a single-field multikey index, which indexes nothing for an
 * empty array. Every password-only account defaults to `oauthAccounts: []`, so without this filter
 * the SECOND such account ever created collides with the first. Restricting the index to documents
 * that actually hold an entry is what makes "unique per linked identity" mean what it says, rather
 * than "at most one account may exist with no linked identity at all".
 */
userSchema.index(
    { 'oauthAccounts.provider': 1, 'oauthAccounts.providerId': 1 },
    {
        name: 'users_oauth_identity',
        unique: true,
        partialFilterExpression: { 'oauthAccounts.0': { $exists: true } }
    }
);
/*
 * A pending email change is claimed by at most one account at a time — same UNIQUE reasoning as
 * `users_email`, and load-bearing for the same reason: the request-time collision check
 * (`account/services/email-change.ts`) and the confirm-time swap into `email` are up to 24 hours
 * apart, so this index, not the request-time read, is what actually stops two accounts racing to
 * claim one address. `partialFilterExpression` restricts it to documents that HOLD one — most
 * users never have `pendingEmail` set, and an unfiltered unique index would index every absent
 * value as an equal `null`, colliding on the second such account.
 */
userSchema.index(
    { pendingEmail: 1 },
    {
        name: 'users_pending_email',
        unique: true,
        partialFilterExpression: { pendingEmail: { $exists: true } }
    }
);
/*
 * `deletedAt` is deliberately not indexed — nothing searches on it. The admin listing filters
 * `active` instead, and the one login query that mentions it also matches on the near-unique,
 * indexed `email`.
 */

/**
 * Pre-save hook: hashes the password with argon2id whenever it changes, so a plaintext value never
 * reaches storage. The cost factors and why are in `src/infrastructure/security/password-hash.ts`.
 */
userSchema.pre('save', function (this: UserDocument) {
    // The second half is only reachable in principle (`isModified` true, value falsy) — an
    // OAuth-only signup never sets `password` at all, so `isModified` is false for it — but it is
    // what lets TypeScript see `this.password` as a `string` below, now that it is optional.
    if (!this.isModified('password') || !this.password) return;

    return hashPassword(this.password).then((hashedPassword) => {
        this.password = hashedPassword;
    });
});

/**
 * The {@link UserRecord} fields that never leave the server: secrets, 2FA material and the
 * reaper's own bookkeeping. One list feeds both the wire type ({@link UserWire}) and the
 * serializer's strip ({@link applyUserTransform}), so neither can drift from the other.
 */
const WIRE_OMITTED_FIELDS = [
    'password',
    'pendingImageKey',
    'inactivityWarnedAt',
    'lastActiveAt',
    'lastApiKeyUseAt',
    'inactivityMinimisedAt',
    'deletedBy',
    'twoFactorMethods',
    'authenticatorEnabledAt',
    'twoFactorBackupCodes',
    'twoFactorBackupCodeSalt',
    'reauthCode',
    'oauthAccounts',
    'mfaFailures',
    'mfaLockedUntil',
    'tokensValidAfter',
    'previousEmail',
    'purchaseHoldResetAt'
] as const;

/**
 * What `search()` actually hands back: {@link UserRecord}, minus the same secrets and
 * document-only bookkeeping {@link applyUserTransform}'s `omit` strips. Real `Date`s, not the
 * ISO strings the `User` contract carries — `./presenter`'s `presentUser` is what narrows those,
 * and it accepts this shape (or a hydrated {@link UserDocument}, a superset of it) rather than the
 * document alone.
 */
export type UserWire = Omit<UserRecord, (typeof WIRE_OMITTED_FIELDS)[number]>;

/**
 * Normalizes a serialized user into the OpenAPI `User` contract: `id` from `_id`, `_id`/`__v`
 * stripped, plus `password` — a credential that must never leave the server. It is
 * also `select: false` on the schema; this is defense in depth, not the only guard. Exported so
 * lean results (which bypass `toJSON`) can be mapped through the same logic — see `./repository`. `active` and `deletedAt` pass through untouched: both are in the `User` contract,
 * and every route serving a `User` list requires `read:User`.
 *
 * This is schema plumbing (a Mongoose-level omit), not the `User` contract itself — `./presenter`
 * is where a document becomes the wire shape; see `presentUser` there.
 */
export const applyUserTransform = applySerialization(userSchema, {
    // `password` is a secret; `pendingImageKey` is document-only bookkeeping for the
    // image digest pipeline, never part of the `User` contract — same reasoning as `products`.
    // `inactivityWarnedAt`, `lastActiveAt`, `lastApiKeyUseAt`, `inactivityMinimisedAt` and `deletedBy` are the reaper's own bookkeeping, same treatment.
    // `twoFactorMethods`/`twoFactorBackupCodes`/`twoFactorBackupCodeSalt` are 2FA credential material —
    // `twoFactorEnabledAt` alone is the `User` contract's business, same asymmetry as
    // the schema's own `select: false` split above. `oauthAccounts` gets the same treatment: not
    // part of the `User` contract, `select: false` on the schema already, this is defense in depth.
    omit: [...WIRE_OMITTED_FIELDS]
});

/** The compiled Mongoose model. */
export const userModel = model<UserDocument, UserModel>('User', userSchema);

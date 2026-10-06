/**
 * @module
 * The user record's Mongoose schema, its Zod wire-validation twin, and the token subdocument
 * methods — long, and deliberately one file, since splitting would separate the password hash
 * hook from the `select: false` that keeps the hash off every read.
 * See: docs/modules/users.md
 */

import { model, Schema } from 'mongoose';
import type { Document, Model, Types } from 'mongoose';
import { hashPassword } from '@infrastructure/security/password-hash';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { t } from '@infrastructure/i18n';
import { localeConfig } from '@infrastructure/i18n/config';
import {
    CreateUserBody,
    createUserBodyEmailMax,
    createUserBodyUsernameMax,
    createUserBodyUsernameMin,
    signupBodyPasswordMin,
    signupBodyPasswordMax
} from '@api/schemas.zod';
import { type User } from '@types';
import { revisionPlugin } from '@infrastructure/persistence/revision-plugin';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * Token types used in jwt-auth
 */
export enum TokenType {
    REFRESH = 'refresh',
    PASSWORD_RESET = 'password',
    /** A login's second-factor challenge — see `account/services/two-factor.ts#buildLoginChallenge`. */
    MFA_CHALLENGE = 'mfa-challenge'
}

/**
 * Digest a token value for storage/lookup. `users.tokens[].token`
 * holds live refresh JWTs, password-reset tokens and delete-confirmation tokens; a plain sha256
 * digest is enough because every value here already carries 128 bits of entropy from
 * `randomBytes(16)` or a signed JWT — there is no low-entropy secret to stretch, and bcrypt would
 * only slow the refresh path every authenticated client hits on a timer. Exported so callers that
 * compare an in-memory token against an already-loaded document (`account/services/tokens.ts`,
 * `users/services/tokens.ts` `consumeToken`) hash the same way storage does — a one-off script that ever
 * rewrites stored rows must reuse it rather than reimplement the digest.
 */
export const hashToken = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

/**
 * Compare two addresses the way the `email`/`pendingEmail` schema paths themselves do —
 * case-insensitively, ignoring surrounding whitespace (`@infrastructure/persistence/normalize-email`).
 * The schema's `lowercase`/`trim` casters cover every database read and write for free (equality,
 * `$or`, `$in`, `$set`); this covers the two in-memory comparisons that never touch a query:
 * `account/services/profile.ts`'s "is this the current address" check and `account/routes.ts`'s
 * `isChangingEmail` guard. Re-exported here so every existing caller of `@modules/users`'s barrel
 * keeps working unchanged.
 */
export { normalizeEmail } from '@infrastructure/persistence/normalize-email';

/**
 * User tokens
 * Token is like an ID, but not really an ID
 */
export interface Token {
    /**
     * The subdocument id Mongoose gives every entry in the array. Optional because a NEW entry
     * has none until written — `tokenAdd` builds the object and lets mongod assign it. It's
     * also the only part of a refresh token that may leave the server: `GET /account/sessions`
     * presents tokens as sessions, and this id is the revocation handle, since the token VALUE
     * itself is as good as a password.
     */
    _id?: Types.ObjectId;
    token: string;
    type: string;
    expiration?: Date;
    /**
     * When `tokenAdd` minted this entry. The record a resend cooldown reads: "how long since the
     * mail carrying this token went out" is a question `expiration` can only answer by being read
     * backwards through the TTL that set it, which silently changes meaning the moment that TTL
     * is reconfigured. Absent on entries written before the field existed — a cooldown treats
     * that as elapsed.
     */
    sentAt?: Date;
    /**
     * When this token was last exchanged for an access token, absent until then — lets
     * `GET /account/sessions` show an idle session as idle rather than indistinguishable from
     * active. Only refresh tokens are ever exchanged, so one-time kinds (a pending reset, a
     * verification link) stay absent.
     */
    lastUsedAt?: Date;
    /**
     * When rotation replaced this refresh token with a new one.
     * The entry stays in `tokens` rather than being removed immediately — see `tokenSupersede`
     * in `../users/repository.ts` for why: a short grace window is what stops two tabs racing to
     * refresh at once from looking like theft. Absent means this token is still live.
     */
    supersededAt?: Date;
    /**
     * Which factor(s) were already proven when this entry was minted. Only set on an
     * `MFA_CHALLENGE`: `account/services/two-factor.ts#verifyLoginChallenge` reads it back once
     * the second factor checks out, so the finished session's own `amr` names how the FIRST one
     * was proven — `['pwd']` for a password login, `[provider]` for an OAuth one — instead of
     * assuming a password. Absent means `['pwd']`: every challenge minted before this field
     * existed was, since 2FA had no OAuth path yet.
     */
    amr?: string[];
}

/**
 * A refresh token that still represents a session someone is holding.
 *
 * `supersededAt` marks a rotated-away entry, kept only for its reuse-detection retention window —
 * its successor is the session, so listing both would show one login twice.
 */
export const isLiveRefreshSession = (token: Token): boolean =>
    // `Token['type']` stays `string` (see `UserMethods.tokenAdd`'s comment below), so the enum
    // member is cast to compare — TS refuses a bare `string === TokenType` for a string enum.
    token.type === (TokenType.REFRESH as string) && !token.supersededAt;

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
    'createdAt' | 'updatedAt' | 'deletedAt' | 'twoFactorEnabledAt' | 'verifiedAt' | 'role'
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
     * Stamped by `scripts/ops/reap-inactive-accounts.ts` the first time it warns
     * this account about impending removal — never set anywhere else. Absent means "never
     * warned"; it is also how the script tells its OWN soft-deletes apart from an admin's when
     * deciding what is safe to hard-delete next, since `deletedAt` alone doesn't say who set it.
     */
    inactivityWarnedAt?: Date;

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
     * When the address was proven, or absent until it is — informational only, see the schema
     * field's own doc comment. Same ISO-string-vs-`Date` redeclaration as `createdAt`/`updatedAt`.
     */
    verifiedAt?: Date | null;

    /** The user's refresh, reset and delete-confirmation tokens — see `Token` above. */
    tokens: Token[];

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
export interface UserDocument extends UserRecord, UserMethods, Document {
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
 * User Document instance methods.
 */
export interface UserMethods {
    // `Token['type']` rather than `TokenType`: the enum names the two token types the JWT
    // layer knows about, while `tokens` also carries the account-deletion type the account
    // endpoints issue. The stored field is a string, and the method has to accept every value
    // that legitimately appears in it.
    tokenAdd: (
        type: Token['type'],
        expirationMs: number,
        token: string,
        amr?: string[]
    ) => Promise<string>;
    tokenRemoveAll: (type: Token['type']) => Promise<void>;
}

/**
 * User Document model type. Business logic lives in the service and repository layers.
 */
export type UserModel = Model<UserDocument, Record<string, never>, UserMethods>;

/**
 * Zod schema for user data validation, built on the orval-generated `CreateUserBody` so only
 * fields needing custom i18n messages are overridden. Sits beside the Mongoose schema on purpose,
 * like `zodProductCreateSchema` beside `products/model.ts` — one for the wire, one for storage.
 * Every message is a THUNK (`error: () => t(...)`), never called eagerly: this module evaluates
 * at import time, before `i18next.init()` runs in `app.ts`, so an eager call would return
 * `undefined` and Zod would silently fall back to its own English message.
 */
export const zodUserSchema = CreateUserBody.extend({
    email: z
        .email({ error: () => t('users.field-email-invalid') })
        .min(1, { error: () => t('users.field-email-required') })
        // The generated ceiling (254, RFC 5321's path limit), restated like the username's: this
        // `.extend()` replaces the generated field outright, and a replaced field drops its bound.
        .max(createUserBodyEmailMax, { error: () => t('users.field-email-invalid') }),

    // The floor comes from the generated `CreateUserBody` (`users/openapi.yaml`), so an admin
    // creating or editing a user and a self-service signup share one number. It is restated here
    // only to give the failure a translated message.
    username: z
        .string()
        .min(1, { error: () => t('users.field-username-required') })
        .min(createUserBodyUsernameMin, { error: () => t('users.field-username-min') })
        // The ceiling is the generated one too (50, a display-name length). A name is printed in
        // greetings and lists, so an unbounded one is text of the caller's choosing in many places.
        .max(createUserBodyUsernameMax, { error: () => t('users.field-username-max') }),

    // Length only (NIST SP 800-63B-4: no composition rules); the breached-password check does the
    // rest. The floor is `SignupBody`'s (`/users` carries no password), restated here only to give
    // the failure a translated message, like the username's above.
    password: z
        .string()
        .min(1, { error: () => t('users.field-password-required') })
        .min(signupBodyPasswordMin, { error: () => t('users.field-password-min') })
        // The generated ceiling (128), restated like the others: this `.extend()` replaces the
        // generated field outright, and a replaced field drops its bound.
        .max(signupBodyPasswordMax, { error: () => t('users.field-password-max') })
});

/**
 * The Mongoose schema for user documents — field-level comments below cover the non-obvious
 * defaults.
 */
export const userSchema = new Schema<UserDocument, UserModel, UserMethods>(
    {
        email: {
            type: String,
            required: true,
            // A backstop, not the real check — `zodUserSchema.email` above (and the generated
            // `CreateUserBody`/`SignupBody`) already validate every parsed body. This covers the
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
         * "Never asked" and "denied" are the same answer, arrived at differently — the gate is
         * opt-in, so only `true` captures. Read off `AuthContext` (threaded through `resolve()`
         * in `account/module.ts`), never the document directly.
         */
        analyticsConsent: {
            type: Boolean,
            default: false
        },
        /*
         * Enforced at signup, not here: `accountService.signup`'s local schema rejects anything
         * but `true`, so every self-signup that reaches this default already validated it.
         * `default: true` is for every OTHER creation path — OAuth linking, the admin `/users`
         * route, test fixtures — none of which shows the checkbox, so none should have to restate
         * it. A row written before the field existed simply reads as `undefined`, which every
         * consumer treats as not accepted.
         */
        termsAccepted: {
            type: Boolean,
            default: true
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
         * Enforcement is the membership role (`unverified` holds no `cart.self.checkout`, see
         * `shared/authorization-keys.yaml`) — this is the record of fact, kept separately because
         * the role can be reassigned: the moment an operator grants a staff role to an unproven
         * address, that grant would otherwise be the only evidence the address was never proven.
         * Set by `completeEmailVerification`/`completeEmailChange`/`passwordResetChange` — every
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
        // sub documents always have _id
        // `select: false` for the same reason as `password` — live refresh tokens are as good as
        // a password to anyone who reads them.
        tokens: {
            type: [
                {
                    type: {
                        type: String,
                        required: true
                    },
                    token: {
                        type: String,
                        required: true
                    },
                    expiration: {
                        type: Date,
                        required: false
                    },
                    sentAt: {
                        type: Date,
                        required: false
                    },
                    lastUsedAt: {
                        type: Date,
                        required: false
                    },
                    supersededAt: {
                        type: Date,
                        required: false
                    },
                    amr: {
                        type: [String],
                        required: false
                    }
                }
            ],
            select: false,
            default: []
        },
        deletedAt: {
            type: Date
        },
        inactivityWarnedAt: {
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
                        type: Date,
                        required: false
                    },
                    secret: {
                        type: String,
                        required: false
                    },
                    lastUsedStep: {
                        type: Number,
                        required: false
                    },
                    codeHash: {
                        type: String,
                        required: false
                    },
                    codeExpiresAt: {
                        type: Date,
                        required: false
                    },
                    codeSentAt: {
                        type: Date,
                        required: false
                    },
                    codeAttempts: {
                        type: Number,
                        required: false
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
                    codeHash: { type: String, required: false },
                    codeExpiresAt: { type: Date, required: false },
                    codeSentAt: { type: Date, required: false },
                    codeAttempts: { type: Number, required: false }
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
         * Linked provider identities — `select: false` like `tokens`, same reasoning: not secret
         * in the credential-theft sense (a `providerId` is useless without the provider's own
         * session), but nothing on the wire needs it by default. Written only through atomic
         * `$push` (`repository.ts#linkOAuthAccount`), never read-modify-write — same rule as
         * `tokens`, and for the same reason: two concurrent logins linking a second provider must
         * not race each other's write away.
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
/* Refresh-token verification and the reset/delete flows query by token value. */
userSchema.index({ 'tokens.token': 1 }, { name: 'users_tokens_token' });
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
 * (`account/services/profile.ts`) and the confirm-time swap into `email` are up to 24 hours
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

/*
 * Token writes are ATOMIC UPDATES ($push/$pull), never read-modify-write. Mutating `this.tokens`
 * then `save()` would send the array as loaded: two concurrent logins each load N tokens, each
 * append one, and the second write silently overwrites the first — a session lost with no error.
 * `$push`/`$pull` are evaluated by mongod at write time, so concurrent operations compose instead
 * of clobbering. The local `this.tokens` resync below is GUARDED: `tokens` is `select: false`, so
 * an unloaded document has `this.tokens === undefined`, and pushing to it would throw *after* the
 * atomic write already succeeded — reporting failure for an operation that, in fact, worked.
 */

/**
 * Add a token to this user document and persist it.
 * Returns the PLAINTEXT token string so callers can use it — the cookie, the emailed link — but
 * only its {@link hashToken} digest is ever written to the document.
 */
userSchema.methods.tokenAdd = function (
    this: UserDocument,
    type: Token['type'],
    expirationMs: number,
    token: string,
    amr?: string[]
): Promise<string> {
    const entry: Token = {
        type,
        token: hashToken(token),
        expiration: expirationMs > 0 ? new Date(Date.now() + expirationMs) : undefined,
        sentAt: new Date(),
        ...(amr && { amr })
    };

    return (this.constructor as UserModel)
        .updateOne({ _id: this._id }, { $push: { tokens: entry } }, { timestamps: false })
        .then(() => {
            // Guarded: see the note above `tokenAdd` — `tokens` is `select: false`, so an
            // unloaded array is `undefined` and pushing to it would throw after the write landed.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the schema types claim `tokens` is always loaded; `select: false` makes that a lie
            this.tokens?.push(entry);
            return token;
        });
};

/**
 * Remove all tokens of the given type from this user document and persist it.
 */
userSchema.methods.tokenRemoveAll = function (this: UserDocument, type: Token['type']) {
    return (this.constructor as UserModel)
        .updateOne({ _id: this._id }, { $pull: { tokens: { type } } }, { timestamps: false })
        .then(() => {
            // Guarded: see the note above `tokenAdd`. The `$pull` above has already revoked the
            // tokens in the database — reporting a failure here would be a lie about a logout
            // that succeeded.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the schema types claim `tokens` is always loaded; `select: false` makes that a lie
            if (this.tokens) this.tokens = this.tokens.filter((t: Token) => t.type !== type);
        });
};

/**
 * What `search()` actually hands back: {@link UserRecord}, minus the same secrets and
 * document-only bookkeeping {@link applyUserTransform}'s `omit` strips. Real `Date`s, not the
 * ISO strings the `User` contract carries — `./presenter`'s `presentUser` is what narrows those,
 * and it accepts this shape (or a hydrated {@link UserDocument}, a superset of it) rather than the
 * document alone.
 */
export type UserWire = Omit<
    UserRecord,
    | 'password'
    | 'tokens'
    | 'pendingImageKey'
    | 'inactivityWarnedAt'
    | 'twoFactorMethods'
    | 'twoFactorBackupCodes'
    | 'twoFactorBackupCodeSalt'
    | 'reauthCode'
    | 'oauthAccounts'
    | 'mfaFailures'
    | 'mfaLockedUntil'
    | 'tokensValidAfter'
    | 'previousEmail'
>;

/**
 * Normalizes a serialized user into the OpenAPI `User` contract: `id` from `_id`, `_id`/`__v`
 * stripped, plus `password` and `tokens` — credentials that must never leave the server. Both are
 * also `select: false` on the schema; this is defense in depth, not the only guard. Exported so
 * lean results (which bypass `toJSON`) can be mapped through the same logic — see `./service`
 * `search()`. `active` and `deletedAt` pass through untouched: both are in the `User` contract,
 * and every route serving a `User` list requires `users.any.read`.
 *
 * This is schema plumbing (a Mongoose-level omit), not the `User` contract itself — `./presenter`
 * is where a document becomes the wire shape; see `presentUser` there.
 */
export const applyUserTransform = applySerialization(userSchema, {
    // `password`/`tokens` are secrets; `pendingImageKey` is document-only bookkeeping for the
    // image digest pipeline, never part of the `User` contract — same reasoning as `products`.
    // `inactivityWarnedAt` is the reaper's own bookkeeping, same treatment.
    // `twoFactorMethods`/`twoFactorBackupCodes`/`twoFactorBackupCodeSalt` are 2FA credential material —
    // `twoFactorEnabledAt` alone is the `User` contract's business, same asymmetry as
    // the schema's own `select: false` split above. `oauthAccounts` gets the same treatment: not
    // part of the `User` contract, `select: false` on the schema already, this is defense in depth.
    omit: [
        'password',
        'tokens',
        'pendingImageKey',
        'inactivityWarnedAt',
        'twoFactorMethods',
        'twoFactorBackupCodes',
        'twoFactorBackupCodeSalt',
        'reauthCode',
        'oauthAccounts',
        'mfaFailures',
        'mfaLockedUntil',
        'tokensValidAfter',
        'previousEmail'
    ]
});

/** The compiled Mongoose model. */
export const userModel = model<UserDocument, UserModel>('User', userSchema);

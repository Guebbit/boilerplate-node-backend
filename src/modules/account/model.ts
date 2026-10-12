/**
 * @module
 * The three collections this module owns.
 *
 * `accountexports`:     one document per account that asked for its data. The row says whose export
 *                       it is and how far the build got; the file itself is in the private export
 *                       store (`@infrastructure/adapters/export-store`), named by `file`.
 * `sessions`:           one row per signed-in session (cookie mode) or per refresh token (jwt mode).
 * `verificationtokens`: one row per one-time link or challenge in flight.
 *
 * Never serialized to the wire as-is: the contract's shapes are built from these rows by hand, and
 * the token digests are stripped from `toJSON` regardless.
 *
 * See: docs/modules/account.md#data-export, docs/modules/account-sessions.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { VERIFICATION_TOKEN_TYPES, ONE_LIVE_TOKEN_TYPES } from './token-types';
import type { VerificationTokenType } from './token-types';

/** How far an export got. `building` until the worker settles it, then one of the other two. */
export const EXPORT_STATUSES = ['building', 'ready', 'failed'] as const;

/** One of {@link EXPORT_STATUSES}. */
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

/** One account's export. */
export interface AccountExportDocument extends Document {
    userId: Types.ObjectId;
    status: ExportStatus;
    /** The file's name in the export store — the row's own id plus `.json`. */
    file: string;
    /** When the request was made — what a `building` row's age is measured from. */
    createdAt: Date;
    /** When the reaper deletes the row and its file. Pushed forward once the build is ready. */
    expiresAt: Date;
}

/** Queries live in `./repository`. */
export type AccountExportModel = Model<AccountExportDocument>;

/**
 * `unique: true` on `userId`: one live export per account is a database fact, so two simultaneous
 * requests cannot both create a row.
 */
export const accountExportSchema = new Schema<AccountExportDocument, AccountExportModel>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        status: { type: String, enum: [...EXPORT_STATUSES], required: true },
        file: { type: String, required: true },
        createdAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true }
    },
    // No `timestamps`: `createdAt` is set by the request, and `expiresAt` is moved on purpose.
    { timestamps: false }
);

// The reaper's read: every row due for deletion.
accountExportSchema.index({ expiresAt: 1 });

/** The compiled Mongoose model — what `./repository` queries against. Collection `accountexports`. */
export const accountExportModel = model<AccountExportDocument, AccountExportModel>(
    'AccountExport',
    accountExportSchema
);

/** How a deployment keeps people signed in — `NODE_SESSION_MODE`. A row belongs to the mode that issued it. */
export const SESSION_MODES = ['jwt', 'cookie'] as const;

/** One of {@link SESSION_MODES}. */
export type SessionMode = (typeof SESSION_MODES)[number];

/**
 * One row of `sessions`. The row's meaning depends on the mode that issued it:
 * - `jwt`:    one row per REFRESH TOKEN. A rotation adds a successor row (same `familyId`) and stamps
 *             the old one `supersededAt`, which is what lets a replayed token be told from a stale one.
 * - `cookie`: one row per SESSION, holding the digest of its current opaque id.
 */
export interface SessionDocument extends Document {
    userId: Types.ObjectId;
    /**
     * The id a session is known by outside the server (`GET /account/sessions`, "log out that
     * device"). Stable across rotation: login mints it, every successor row copies it.
     */
    familyId: Types.ObjectId;
    /** The mode that issued this row; a row of the other mode is never listed or honoured. */
    mode: SessionMode;
    /** sha256 of the credential (a refresh JWT, or the opaque session id). Never the value itself. */
    tokenHash: string;
    /**
     * Epoch seconds the account last proved itself (the step-up clock). Cookie mode only: a JWT
     * carries it as a claim, so a `jwt` row does not need it.
     */
    authTime?: number;
    /** How `authTime` was proved (RFC 8176 values). Cookie mode only, for the same reason. */
    amr?: string[];
    /** The "remember me" tier ticked at login. Cookie mode only. */
    remember?: string;
    /** When this sign-in happened — copied to every rotation successor, so it names the session, not the token. */
    startedAt: Date;
    /** When the credential was last exchanged or used; absent until then. */
    lastUsedAt?: Date;
    /** `jwt` only: when rotation replaced this token. The row is then kept for its reuse-detection window. */
    supersededAt?: Date;
    /** When the session ends. Reads check it: the TTL monitor lags by up to a minute. */
    expiresAt: Date;
    /** When the database deletes the row: `expiresAt`, or sooner for a superseded `jwt` row. */
    purgeAt: Date;
    /** A coarse "Firefox on Linux" label parsed at login. Cookie mode only. */
    device?: string;
}

/** Queries live in `./repository`. */
export type SessionModel = Model<SessionDocument>;

/** `sessions`' schema. The digest never serializes. */
export const sessionSchema = new Schema<SessionDocument, SessionModel>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        familyId: { type: Schema.Types.ObjectId, required: true },
        mode: { type: String, enum: [...SESSION_MODES], required: true },
        tokenHash: { type: String, required: true, unique: true },
        authTime: { type: Number },
        amr: { type: [String], default: undefined },
        remember: { type: String },
        startedAt: { type: Date, required: true },
        lastUsedAt: { type: Date },
        supersededAt: { type: Date },
        expiresAt: { type: Date, required: true },
        purgeAt: { type: Date, required: true },
        device: { type: String }
    },
    // No `timestamps`: `startedAt` and `lastUsedAt` are set on purpose, and a touch is no edit.
    { timestamps: false }
);

applySerialization(sessionSchema, { omit: ['tokenHash'] });

// Deletes the row at its own `purgeAt` (`expireAfterSeconds: 0`: "at that time"). A per-row date,
// not an env-driven TTL, so changing a lifetime never rebuilds the index.
// https://www.mongodb.com/docs/manual/tutorial/expire-data/
sessionSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

// "this account's sessions", and "this one session" — the list, a revoke, logout everywhere.
sessionSchema.index({ userId: 1, familyId: 1 });

/** The compiled Mongoose model for `sessions`. */
export const sessionModel = model<SessionDocument, SessionModel>('Session', sessionSchema);

/**
 * One row of `verificationtokens`: a one-time link or challenge in flight. Spending it deletes the
 * row, so there is no "used" state to keep.
 */
export interface VerificationTokenDocument extends Document {
    userId: Types.ObjectId;
    /** Which flow the link belongs to — closed to {@link VERIFICATION_TOKEN_TYPES}. */
    type: VerificationTokenType;
    /** sha256 of the value in the mailed link or the challenge. Never the value itself. */
    tokenHash: string;
    /** When it was issued: what a resend cooldown measures from, whatever the TTL is configured to. */
    sentAt: Date;
    /** When it stops working, and when the database deletes it. */
    expiresAt: Date;
    /** An MFA challenge only: how the first factor was proven, handed back once the second checks out. */
    amr?: string[];
}

/** Queries live in `./repository`. */
export type VerificationTokenModel = Model<VerificationTokenDocument>;

/** `verificationtokens`' schema. The digest never serializes. */
export const verificationTokenSchema = new Schema<
    VerificationTokenDocument,
    VerificationTokenModel
>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, enum: [...VERIFICATION_TOKEN_TYPES], required: true },
        tokenHash: { type: String, required: true, unique: true },
        sentAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true },
        amr: { type: [String], default: undefined }
    },
    { timestamps: false }
);

applySerialization(verificationTokenSchema, { omit: ['tokenHash'] });

// The database deletes the row at its own `expiresAt`; reads still check it (the monitor lags).
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// One live link per account per kind, for the kinds that allow only one: a PARTIAL index, so the
// kinds that allow several (a delete confirmation, an MFA challenge) are not constrained by it.
verificationTokenSchema.index(
    { userId: 1, type: 1 },
    { unique: true, partialFilterExpression: { type: { $in: [...ONE_LIVE_TOKEN_TYPES] } } }
);

/** The compiled Mongoose model for `verificationtokens`. */
export const verificationTokenModel = model<VerificationTokenDocument, VerificationTokenModel>(
    'VerificationToken',
    verificationTokenSchema
);

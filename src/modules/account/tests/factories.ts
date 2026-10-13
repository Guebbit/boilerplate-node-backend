/**
 * @module
 * Test helpers for `sessions` and `verificationtokens`: plant a row whose plaintext the test knows,
 * and read the rows an account holds. Plain functions over the module's own models, so a suite in
 * another module reaches them here rather than through a repository the barrel does not publish.
 */

import { Types } from 'mongoose';
import type { Request, Response } from 'express';
import { hashToken } from '@infrastructure/security/hash-token';
import { asStub } from '@tests/stub';
import { sessionModel, verificationTokenModel } from '../model';
import type { SessionDocument } from '../model';
import { sessionRepository, verificationTokenRepository } from '../repository';
import type { SessionRow, VerificationTokenRow } from '../repository';
import type { VerificationTokenType } from '../token-types';
import { SESSION_COOKIE } from '@kernel/cookies';
import { activeStrategy, type IssueOptions, type SessionRequest } from '../session/strategy';
import { AMR } from '../domain/session-proof';

/** What a test may pin on a planted one-time token. */
export interface PlantedToken {
    /** How long it lives from now; negative plants an already-expired one. Defaults to an hour. */
    ttlMs?: number;
    /** When it was issued — what a resend cooldown measures from. Defaults to now. */
    sentAt?: Date;
    /** An MFA challenge's first-factor proof. */
    amr?: string[];
}

/**
 * Store a one-time token whose plaintext the test chooses, through the same upsert a real issue
 * uses — so a one-live-link kind replaces whatever the account already holds.
 *
 * @param userId - the account
 * @param type - the kind
 * @param plaintext - the value the test will present as the link's token
 * @param options - lifetime, issue time and `amr`
 */
export const plantToken = (
    userId: string,
    type: VerificationTokenType,
    plaintext: string,
    { ttlMs = 60 * 60 * 1000, sentAt = new Date(), amr }: PlantedToken = {}
): Promise<void> =>
    verificationTokenRepository.issue({
        userId,
        type,
        tokenHash: hashToken(plaintext),
        sentAt,
        expiresAt: new Date(Date.now() + ttlMs),
        ...(amr && { amr })
    });

/** What a test may pin on a planted session row. */
export interface PlantedSession {
    /** The session's public id; a fresh one when absent. */
    familyId?: string;
    /** `jwt` unless pinned. */
    mode?: SessionDocument['mode'];
    /** Lifetime from now; negative plants an expired one. Defaults to a day. */
    ttlMs?: number;
    /** When this sign-in began; now when absent. */
    startedAt?: Date;
    supersededAt?: Date;
    lastUsedAt?: Date;
}

/**
 * Store a session row for a credential the test already holds. `purgeAt` follows the same rule a
 * real row's does: the expiry, or sooner for a superseded one when `supersededAt` is given with a
 * short window (pass the date; the test sets what it is checking).
 *
 * @param userId - the account
 * @param plaintext - the credential the test will present
 * @param options - what to pin
 */
export const plantSession = (
    userId: string,
    plaintext: string,
    {
        familyId,
        mode = 'jwt',
        ttlMs = 24 * 60 * 60 * 1000,
        startedAt = new Date(),
        supersededAt,
        lastUsedAt
    }: PlantedSession = {}
): Promise<SessionRow> => {
    const expiresAt = new Date(Date.now() + ttlMs);
    return sessionModel
        .create({
            userId: new Types.ObjectId(userId),
            familyId: familyId ? new Types.ObjectId(familyId) : new Types.ObjectId(),
            mode,
            tokenHash: hashToken(plaintext),
            startedAt,
            expiresAt,
            purgeAt: expiresAt,
            ...(supersededAt && { supersededAt }),
            ...(lastUsedAt && { lastUsedAt })
        })
        .then((row) => row.toObject<SessionRow>());
};

/**
 * Delete every session an account holds, the way a revocation does.
 *
 * @param userId - the account
 */
export const dropAllSessions = (userId: string): Promise<number> =>
    sessionRepository.removeAll(userId);

/**
 * Delete the one session a credential belongs to — a logout of that session.
 *
 * @param plaintext - the credential the test holds
 */
export const dropSessionOf = (plaintext: string): Promise<number> =>
    sessionRepository.removeByHash(hashToken(plaintext));

/**
 * Every session row an account holds, live or not — for a test asserting what a flow left behind.
 *
 * @param userId - the account
 */
export const sessionRowsOf = (userId: string): Promise<SessionRow[]> =>
    sessionModel
        .find({ userId: new Types.ObjectId(userId) })
        .sort({ _id: 1 })
        .lean<SessionRow[]>()
        .exec();

/**
 * Delete every session row whose `purgeAt` has passed — what the database's TTL monitor does about
 * once a minute, which a test cannot wait for. Reads the (possibly frozen) clock, like the code
 * under test does.
 */
export const reapDueSessions = (): Promise<number> =>
    sessionModel
        .deleteMany({ purgeAt: { $lte: new Date() } })
        .exec()
        .then(({ deletedCount }) => deletedCount);

/**
 * The digests of every session an account holds, oldest first.
 *
 * @param userId - the account
 */
export const sessionHashesOf = (userId: string): Promise<string[]> =>
    sessionRowsOf(userId).then((rows) => rows.map((row) => row.tokenHash));

/**
 * The digests of every one-time token an account holds, oldest first.
 *
 * @param userId - the account
 */
export const tokenHashesOf = (userId: string): Promise<string[]> =>
    tokenRowsOf(userId).then((rows) => rows.map((row) => row.tokenHash));

/**
 * The kinds of every one-time token an account holds, oldest first.
 *
 * @param userId - the account
 */
export const tokenTypesOf = (userId: string): Promise<string[]> =>
    tokenRowsOf(userId).then((rows) => rows.map((row) => row.type));

/**
 * The session row holding a credential, however dead.
 *
 * @param plaintext - the credential the test holds
 */
export const sessionRowFor = (plaintext: string): Promise<SessionRow | null> =>
    sessionRepository.findByHash(hashToken(plaintext));

/**
 * Every one-time token row an account holds, expired or not.
 *
 * @param userId - the account
 */
export const tokenRowsOf = (userId: string): Promise<VerificationTokenRow[]> =>
    verificationTokenModel
        .find({ userId: new Types.ObjectId(userId) })
        .sort({ _id: 1 })
        .lean<VerificationTokenRow[]>()
        .exec();

/**
 * Move a token's issue time into the past, so a resend cooldown has run out. Ageing the recorded
 * send rather than faking a clock: `sentAt` is what the cooldown reads.
 *
 * @param userId - the account
 * @param type - the kind
 * @param ageMs - how much older to make it
 */
export const ageTokenSend = (
    userId: string,
    type: VerificationTokenType,
    ageMs: number
): Promise<void> =>
    verificationTokenModel
        .updateOne(
            { userId: new Types.ObjectId(userId), type },
            [{ $set: { sentAt: { $subtract: ['$sentAt', ageMs] } } }],
            // `updatePipeline`: Mongoose refuses an array update unless told it is a pipeline.
            { updatePipeline: true }
        )
        .exec()
        .then(() => undefined);

/**
 * Delete every token of one kind an account holds — a test getting past a cooldown or a one-live
 * rule without waiting for it.
 *
 * @param userId - the account
 * @param type - the kind
 */
export const removeTokensOfKind = (userId: string, type: VerificationTokenType): Promise<void> =>
    verificationTokenRepository.removeOfTypes(userId, [type]);

/**
 * The token row of one kind an account holds, if any.
 *
 * @param userId - the account
 * @param type - the kind
 */
export const tokenRowOf = (
    userId: string,
    type: VerificationTokenType
): Promise<VerificationTokenRow | undefined> =>
    tokenRowsOf(userId).then((rows) => rows.find((row) => row.type === type));

/** A session opened straight through the active strategy, in whichever mode the suite runs. */
export interface MintedSession {
    /** `Authorization` for the session: the access token in `jwt` mode, the `ses_…` id in `cookie` mode. */
    bearer: `Bearer ${string}`;
    /** The session cookie as a `Cookie` header: the refresh token in `jwt` mode, the id in `cookie` mode. */
    cookie: string;
}

/**
 * Open a session for an account the way a login does, without a login's second factor check or a
 * password — what a suite wants when it needs a caller who proved ONLY what it says (`amr`), such
 * as the shape an OAuth callback leaves behind. Goes through `activeStrategy().issue`, so the
 * same line works in both session modes.
 *
 * @param userId - the account
 * @param options - what the login proved (`amr`, a password by default), and the rest of a login's own options
 */
export const mintSession = (
    userId: string,
    options: Partial<IssueOptions> = {}
): Promise<MintedSession> => {
    const cookies = new Map<string, string>();
    const response = asStub<Response>({
        cookie: (name: string, value: string) => {
            cookies.set(name, value);
        },
        clearCookie: () => undefined
    });
    const request = asStub<SessionRequest & Pick<Request, 'get'>>({
        cookies: {},
        headers: {},
        get: () => undefined
    });
    // `bearer` transport: `cookie` mode returns the id in the result; `jwt` mode ignores it,
    // returns its access token and puts the refresh token on the cookie stub above.
    return activeStrategy()
        .issue(request, response, userId, { transport: 'bearer', amr: [AMR.password], ...options })
        .then((issued) => {
            const credential = issued.token ?? issued.sessionToken;
            const refresh = cookies.get(SESSION_COOKIE) ?? issued.sessionToken;
            if (!credential || !refresh)
                throw new Error('mintSession: the strategy issued nothing');
            return {
                bearer: `Bearer ${credential}` as const,
                cookie: `${SESSION_COOKIE}=${refresh}`
            };
        });
};

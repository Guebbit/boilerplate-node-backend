/**
 * @module
 * How a deployment keeps people signed in, as one port with two adapters. Everything above this
 * file — login, 2FA, the OAuth callback, reauth, the resolver's caller context — calls
 * {@link activeStrategy} and never asks which mode is on.
 *
 * The port:  issue at login · resolve a request · re-mint on a step-up · list
 * `jwt`:     a short access token plus a rotating refresh token (`./jwt-strategy.ts`)
 * `cookie`:  one random id, stored hashed, in an HttpOnly cookie or a `ses_…` bearer
 *            (`./cookie-strategy.ts`)
 *
 * Chosen once per process from `NODE_SESSION_MODE`; switching it signs everyone out, because a
 * row only ever belongs to the mode that issued it. See docs/theory/sessions.md.
 */

import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import type { Resolution } from '@kernel/authentication';
import type { AuthContext, Session } from '@types';
import type { SessionMode } from '../session-mode';
import { getSessionMode, type RefreshTokenExpiryTime } from './config';
import { jwtStrategy } from './jwt-strategy';
import { cookieStrategy } from './cookie-strategy';

/** The slice of a request a strategy reads: the session cookie, the headers and how it authenticated. */
export type SessionRequest = Pick<Request, 'cookies' | 'headers' | 'sessionVia'>;

/**
 * How a login hands its credential back — `transport` in the login body.
 * - `cookie`:  the HttpOnly session cookie (a browser). No credential in the body.
 * - `bearer`:  nothing set; the body carries the `ses_…` id to send as `Authorization: Bearer`.
 *
 * Only `cookie` mode has a choice: `jwt` always sets its refresh cookie and returns an access token.
 */
export const SESSION_TRANSPORTS = ['cookie', 'bearer'] as const;

/** One of {@link SESSION_TRANSPORTS}. */
export type SessionTransport = (typeof SESSION_TRANSPORTS)[number];

/** What a login asks of a strategy. */
export interface IssueOptions {
    /** The ticked "remember me" tier; absent for a browser-session login. */
    remember?: RefreshTokenExpiryTime;
    /** How `authTime` was proved; the mint refuses a 2FA account whose proof lacks `otp`. */
    amr: readonly string[];
    /**
     * When the proof's check BEGAN, epoch milliseconds — read before the password hash, the code or
     * the OAuth exchange. Becomes `authTime` (in seconds, OIDC's `auth_time`); the mint refuses it
     * once the account's epoch has moved past it.
     */
    provedAt: number;
    /** Where the credential goes. Defaults to `'cookie'`. */
    transport?: SessionTransport;
}

/**
 * What a session being replaced carried that must survive the replacement: its persistence tier
 * and, in `cookie` mode, the identity the owner sees in the list. Read BEFORE a change that
 * deletes the session (a password change, a factor change), so the re-mint can continue it.
 */
export interface SessionSnapshot {
    remember?: RefreshTokenExpiryTime;
    familyId?: Types.ObjectId;
    startedAt?: Date;
    expiresAt?: Date;
    device?: string;
}

/** The credential fields a login-shaped response carries — `AuthTokens` on the wire. */
export interface IssuedSession {
    /** The access JWT (`jwt` mode only). */
    token?: string;
    /** The `ses_…` id, for a `cookie`-mode login that asked for the `bearer` transport. */
    sessionToken?: string;
}

/** A re-mint: the proof the new session claims, and what the old one carried. */
export interface ReissueOptions {
    /** The proofs the replacement session claims. */
    amr: readonly string[];
    snapshot?: SessionSnapshot;
}

/** One way of keeping people signed in. */
export interface SessionStrategy {
    /** Which mode this is — what a row's `mode` is compared against. */
    readonly mode: SessionMode;
    /** Whether the session cookie authenticates ordinary routes, not only the two SSE streams. */
    readonly cookieAuthenticates: boolean;

    /**
     * Mint a session for an account and put its credential on the response.
     *
     * @throws {SecondFactorRequiredError} for a first session on an account whose second factor `amr` lacks
     * @throws {StaleProofError} when the account's epoch moved after `provedAt`
     */
    issue(
        request: SessionRequest & Pick<Request, 'get'>,
        response: Response,
        userId: string,
        options: IssueOptions
    ): Promise<IssuedSession>;

    /** What the caller's own session carries, for {@link SessionStrategy.reissue} after a change. */
    snapshot(request: SessionRequest, userId: string): Promise<SessionSnapshot>;

    /** Replace the caller's session with one that claims `amr` — reauth, a password change. */
    reissue(
        request: SessionRequest & Pick<Request, 'get'>,
        response: Response,
        userId: string,
        options: ReissueOptions
    ): Promise<IssuedSession>;

    /**
     * Re-mint ONLY the caller's cookie after a change that ended every session including theirs (a
     * second-factor change). Never fails the response: the change already happened.
     */
    remint(
        request: SessionRequest & Pick<Request, 'get'>,
        response: Response,
        userId: string,
        options: { amr: readonly string[]; snapshot?: SessionSnapshot }
    ): Promise<void>;

    /** Resolve the credential an `Authorization: Bearer` header carries (not an `sk_…` key). */
    resolveBearer(token: string): Promise<Resolution<AuthContext | undefined>>;

    /** Resolve the session cookie's value. */
    resolveCookie(token: string): Promise<Resolution<AuthContext | undefined>>;

    /** The credential naming the caller's own session on this request, if it carries one. */
    credentialOf(request: SessionRequest): string | undefined;

    /** The account's live sessions, marking the one `credential` belongs to. */
    list(userId: string, credential: string | undefined): Promise<Session[]>;
}

/**
 * The strategy for this process's mode. Read per call, not frozen at import: the mode is a
 * configuration value, and a test (or a restart) that changes it must be honoured.
 */
export const activeStrategy = (): SessionStrategy =>
    getSessionMode() === 'cookie' ? cookieStrategy : jwtStrategy;

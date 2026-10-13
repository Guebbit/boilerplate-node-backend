/**
 * @module
 * The calls every flow that mints or re-mints a live session makes, in one place: the controllers
 * (login, signup, 2FA, the OAuth callback, reauth, a password change, a factor change) call these
 * and never learn which session mode is on — that is {@link activeStrategy}'s business.
 * See docs/modules/account-sessions.md and docs/theory/sessions.md.
 */

import type { Request, Response } from 'express';
import { activeStrategy } from './strategy';
import type {
    IssuedSession,
    IssueOptions,
    ReissueOptions,
    SessionRequest,
    SessionSnapshot
} from './strategy';

/** The slice of a request every function here needs. */
type SessionCaller = SessionRequest & Pick<Request, 'get'>;

/**
 * Mint a session for an account and put its credential on `response`.
 *
 * @param request - the request that logged in, for the transport and the device
 * @param response - the live response to set the cookies on
 * @param userId - whose session this is
 * @param options - the "remember me" tier, how `auth_time` was proved, and transport
 * @returns the credential fields the response body carries (`AuthTokens` on the wire)
 * @throws when the session cannot be persisted or signed, or `SecondFactorRequiredError` for a
 *   first session on an account whose second factor `amr` does not carry
 */
export const issueSession = (
    request: SessionCaller,
    response: Response,
    userId: string,
    options: IssueOptions
): Promise<IssuedSession> => activeStrategy().issue(request, response, userId, options);

/**
 * What the caller's own session carries — read BEFORE a change that deletes it (a password change,
 * a factor change), so the re-mint that follows can keep its persistence and, in `cookie` mode,
 * the identity the owner sees in their list.
 *
 * @param request - the authenticated request
 * @param userId - the authenticated caller
 */
export const sessionSnapshotOf = (
    request: SessionRequest,
    userId: string
): Promise<SessionSnapshot> => activeStrategy().snapshot(request, userId);

/**
 * Re-mint the caller's live session KEEPING its persistence: reauth and a password change replace
 * the session, and must neither strand a remembered login on a session cookie nor make a
 * browser-session one persistent.
 *
 * @param request - the authenticated request, carrying the current credential
 * @param response - the live response to set the cookies on
 * @param userId - whose session this is
 * @param options - `amr`: the proofs the replacement claims (`[AMR.password]` after a password
 *   change, what the call just proved after a re-authentication);
 *   `snapshot`: from {@link sessionSnapshotOf}, when the change deleted the session first
 * @returns the credential fields the response body carries
 */
export const reissueSession = (
    request: SessionCaller,
    response: Response,
    userId: string,
    options: ReissueOptions
): Promise<IssuedSession> => activeStrategy().reissue(request, response, userId, options);

/**
 * Re-mint ONLY the caller's session cookie, after a change that revoked every session including
 * theirs (a 2FA factor change). The way GitHub and Google keep the acting device signed in.
 *
 * Never fails the response: the change already happened, so a failed re-mint degrades to "sign in
 * again", logged, rather than reporting the change as failed.
 *
 * @param request - the authenticated request
 * @param response - the live response to set the cookies on
 * @param userId - whose session this is
 * @param amr - the caller's own proofs, carried onto the re-minted session unchanged
 * @param snapshot - from {@link sessionSnapshotOf}, taken before the change
 */
export const remintSession = (
    request: SessionCaller,
    response: Response,
    userId: string,
    amr: readonly string[],
    snapshot?: SessionSnapshot
): Promise<void> => activeStrategy().remint(request, response, userId, { amr, snapshot });

/**
 * The credential naming the caller's own session on this request — what `current` is matched
 * against and what a logout deletes. A caller authenticated some other way has none.
 *
 * @param request - the incoming request
 */
export const sessionCredentialOf = (request: SessionRequest): string | undefined =>
    activeStrategy().credentialOf(request);

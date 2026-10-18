/**
 * @module
 * `GET /account/oauth/:provider/callback` controller — the redirect a provider's consent screen
 * lands the browser back on. Three outcomes only ever reach the caller: a 404 for a provider this
 * deployment never configured, a 400 for a state that doesn't match its cookie, or a 302 back to
 * the paired frontend — with `?error=<code>` on the frontend redirect for everything else that can
 * go wrong, since by then the browser is mid-navigation and a JSON body has nowhere to be read.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { rejectResponse } from '@infrastructure/http/response';
import { logger } from '@infrastructure/adapters/logger';
import { callerContextOf } from '@infrastructure/http/request';
import { cookieOf } from '@infrastructure/http/cookies';
import { resolveOAuthProvider } from '../oauth/providers';
import {
    stateMatches,
    destroyStateCookie,
    destroyVerifierCookie,
    destroyContinueCookie,
    destroyLocaleCookie,
    destroyLinkCookie,
    isSameOriginPath,
    isLocaleTag,
    OAUTH_STATE_COOKIE,
    OAUTH_VERIFIER_COOKIE,
    OAUTH_LINK_COOKIE,
    OAUTH_CONTINUE_COOKIE,
    OAUTH_LOCALE_COOKIE
} from '../oauth/state';
import { createMfaChallengeCookie } from '../oauth/mfa-redirect';
import {
    oauthCallbackUrl,
    oauthFrontendCallbackUrl,
    oauthFrontendMfaCallbackUrl
} from '../oauth/config';
import {
    accountService,
    twoFactorService,
    OAuthEmailUnverifiedError,
    OAuthAccountUnverifiedError,
    OAuthAccountUnavailableError,
    OAuthAccountExistsError,
    OAuthIdentityTakenError,
    OAuthLinkExpiredError
} from '../services';
import { issueSession } from '../session/session';
import { recordLoginSuccess } from '../session/login-observability';
import { rememberDevice } from '../session/device-cookie';
import { authOauthTotal } from '../metrics';

/**
 * Clears all five single-attempt OAuth cookies — called at every outcome of one login attempt,
 * success or failure, since none of the state, the verifier or the saved `continue` path and locale is any
 * use past this callback.
 */
const clearOAuthCookies = (response: Response): void => {
    destroyStateCookie(response);
    destroyVerifierCookie(response);
    destroyContinueCookie(response);
    destroyLocaleCookie(response);
    destroyLinkCookie(response);
};

/**
 * GET /account/oauth/:provider/callback
 * Validates the CSRF `state`, exchanges the code, then finds-or-creates the account and mints a
 * session exactly the way `postLogin`'s success tail does (a connect attempt from a signed-in
 * account links instead and mints nothing) — minus the access token, which the
 * frontend's `POST /account/refresh` bootstrap mints once it lands.
 */
export const getOAuthCallback = (request: Request, response: Response) => {
    const providerName = String(request.params.provider).toLowerCase();
    const provider = resolveOAuthProvider(providerName);
    const context = callerContextOf(request);

    if (!provider) {
        rejectResponse(response, 404, [t('account.oauth.unknown-provider')]);
        return;
    }

    const query = request.query as Record<string, unknown>;

    /** The language the visitor started the login in — re-validated for the same reason as
     * `continue` below, and read lazily because every caller runs after `state` is trusted. */
    const savedLocale = (): string | undefined => {
        const saved = cookieOf(request, OAUTH_LOCALE_COOKIE);
        return isLocaleTag(saved) ? saved : undefined;
    };

    /** Audit + metric for a failed attempt, then clear both single-attempt cookies — the tail
     * every failure path shares, whichever response follows. */
    const recordFailureAndClear = (reason: string) => {
        accountService.recordOAuthFailure(context, providerName, reason);
        authOauthTotal.inc({ provider: providerName, status: 'failure' });
        clearOAuthCookies(response);
    };

    /** `recordFailureAndClear`, then fail towards the FRONTEND with `?error=<reason>` rather
     * than a JSON body — the browser is mid-navigation by the time any of this runs. */
    const failToFrontend = (reason: string) => {
        recordFailureAndClear(reason);
        response.redirect(302, oauthFrontendCallbackUrl(reason, undefined, savedLocale()));
    };

    if (!stateMatches(cookieOf(request, OAUTH_STATE_COOKIE), query.state)) {
        recordFailureAndClear('invalid_state');
        rejectResponse(response, 400, [t('account.oauth.invalid-state')]);
        return;
    }

    // Read only once `state` is trusted — a forged callback must not choose where a stranger's
    // browser lands. Re-validated here too, not just at the start controller: a cookie is
    // client-writable, so its value is never trusted on the strength of its name alone.
    const savedContinue = cookieOf(request, OAUTH_CONTINUE_COOKIE);
    const continueTo = isSameOriginPath(savedContinue) ? savedContinue : undefined;

    // A missing verifier must fail closed, not silently redeem the code without PKCE: a provider
    // that received no challenge at the start happily accepts an exchange with no verifier, so
    // "no cookie" and "no PKCE" must never share a branch.
    const verifier = cookieOf(request, OAUTH_VERIFIER_COOKIE);
    if (typeof verifier !== 'string' || verifier.length === 0) {
        recordFailureAndClear('invalid_verifier');
        rejectResponse(response, 400, [t('account.oauth.invalid-verifier')]);
        return;
    }

    // The provider redirects back with `error` instead of `code` when consent is declined.
    if (typeof query.error === 'string') {
        failToFrontend('access_denied');
        return;
    }
    if (typeof query.code !== 'string') {
        failToFrontend('provider_error');
        return;
    }

    // Read before the code exchange: a password changed while it runs must refuse this login.
    const provedAt = Date.now();

    // A connect attempt carries its own cookie, set by the signed-in start. It never signs anyone in:
    // the account that began it is already signed in, so the callback links the identity to THAT
    // account and sends the browser back to where it was.
    const linkToken = cookieOf(request, OAUTH_LINK_COOKIE);
    if (typeof linkToken === 'string' && linkToken.length > 0) {
        return provider
            .exchangeCode(oauthCallbackUrl(provider.name, request.originalUrl), {
                state: String(cookieOf(request, OAUTH_STATE_COOKIE)),
                codeVerifier: verifier
            })
            .then((identity) =>
                accountService.linkProviderToSignedInAccount(
                    linkToken,
                    provider.name,
                    identity,
                    context
                )
            )
            .then(() => {
                authOauthTotal.inc({ provider: providerName, status: 'success' });
                clearOAuthCookies(response);
                response.redirect(
                    302,
                    oauthFrontendCallbackUrl(undefined, continueTo, savedLocale(), provider.name)
                );
            })
            .catch((error: unknown) => {
                // The identity belongs to someone else: the person must disconnect it there first.
                if (error instanceof OAuthIdentityTakenError) {
                    failToFrontend('already_linked');
                    return;
                }
                if (error instanceof OAuthLinkExpiredError) {
                    failToFrontend('link_expired');
                    return;
                }
                if (error instanceof OAuthAccountUnavailableError) {
                    failToFrontend('provider_error');
                    return;
                }
                // Stryker disable all
                logger.error({
                    message: 'OAuth connect callback failed',
                    provider: providerName,
                    error
                });
                // Stryker restore all
                failToFrontend('provider_error');
            });
    }

    return provider
        .exchangeCode(oauthCallbackUrl(provider.name, request.originalUrl), {
            state: String(cookieOf(request, OAUTH_STATE_COOKIE)),
            codeVerifier: verifier
        })
        .then((identity) => accountService.loginOrCreateFromOAuth(provider.name, identity, context))
        .then(({ user, outcome }) => {
            /*
             * A factor armed on the password path applies here too — 2FA is a control on the
             * ACCOUNT, not on one login method. Minting a session directly would let a provider
             * alone stand in for a second factor the owner deliberately turned on — see 1b in
             * docs/theory/defences/authentication.md#federated-login.
             */
            if (!user.twoFactorEnabledAt) {
                return issueSession(request, response, user.id, {
                    amr: [provider.name],
                    provedAt
                }).then(() => {
                    // The same completed-login mark the password path sets (Q15): the cookie
                    // grants nothing but a skipped per-account failure budget.
                    rememberDevice(request, response, user.email);
                    /*
                     * Only a genuine LOGIN owes the audit row: `link`/`signup` already audited
                     * themselves in full inside `loginOrCreateFromOAuth` — recording AUTH_LOGIN
                     * here too would double-count the event under a second action name.
                     */
                    return (
                        outcome === 'login'
                            ? recordLoginSuccess(request, user.id, { via: provider.name })
                            : Promise.resolve()
                    ).then(() => {
                        authOauthTotal.inc({ provider: providerName, status: 'success' });
                        clearOAuthCookies(response);
                        response.redirect(
                            302,
                            oauthFrontendCallbackUrl(undefined, continueTo, savedLocale())
                        );
                    });
                });
            }

            return twoFactorService.buildLoginChallenge(user, [provider.name]).then((challenge) => {
                createMfaChallengeCookie(response, challenge.challenge, challenge.expiresAt);
                authOauthTotal.inc({ provider: providerName, status: 'mfa_required' });
                clearOAuthCookies(response);
                response.redirect(
                    302,
                    oauthFrontendMfaCallbackUrl(challenge, continueTo, savedLocale())
                );
            });
        })
        .catch((error: unknown) => {
            if (error instanceof OAuthEmailUnverifiedError) {
                failToFrontend('email_unverified');
                return;
            }
            // A matching account exists, but a sign-in does not link: the owner signs in the way
            // the account allows and connects the provider from their profile.
            if (error instanceof OAuthAccountExistsError) {
                failToFrontend('account_exists');
                return;
            }
            // A DIFFERENT code from the one above, because the remedy is different: there the
            // caller verifies with the provider, here they reset the password on the account
            // already holding this address.
            if (error instanceof OAuthAccountUnverifiedError) {
                failToFrontend('account_unverified');
                return;
            }
            // A banned or soft-deleted account answers like any other provider failure: the
            // caller must not learn what state the account is in. Expected, so not logged as one.
            if (error instanceof OAuthAccountUnavailableError) {
                failToFrontend('provider_error');
                return;
            }
            // The provider/exchange detail is developer-facing only — same rule
            // `rejectDatabaseError` follows for a driver failure.
            // Stryker disable all
            logger.error({
                message: 'OAuth callback failed',
                provider: providerName,
                error
            });
            // Stryker restore all
            failToFrontend('provider_error');
        });
};

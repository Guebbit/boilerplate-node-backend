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
import { resolveOAuthProvider } from '../oauth/providers';
import { stateMatches, destroyStateCookie, OAUTH_STATE_COOKIE } from '../oauth/state';
import { oauthRedirectUri, oauthFrontendCallbackUrl } from '../oauth/config';
import { loginOrCreateFromOAuth, recordOAuthFailure, OAuthEmailUnverifiedError } from '../services';
import { issueSession } from '../session/session';
import { authOauthTotal } from '../metrics';

/**
 * GET /account/oauth/:provider/callback
 * Validates the CSRF `state`, exchanges the code, then finds-or-creates the account and mints a
 * session exactly the way `postLogin`'s success tail does — minus the access token, which the
 * frontend's `GET /account/refresh` bootstrap mints once it lands.
 */
export const getOAuthCallback = (request: Request, response: Response) => {
    const providerName = String(request.params.provider).toLowerCase();
    const provider = resolveOAuthProvider(providerName);
    const context = callerContextOf(request);

    if (!provider) {
        rejectResponse(response, 404, [t('account.oauth.unknown-provider')]);
        return;
    }

    const cookies = request.cookies as Record<string, string | undefined>;
    const query = request.query as Record<string, unknown>;

    /** Audit + metric for a failed attempt, then fail towards the FRONTEND with `?error=<reason>`
     * rather than a JSON body — the browser is mid-navigation by the time any of this runs. */
    const failToFrontend = (reason: string) => {
        recordOAuthFailure(context, providerName, reason);
        authOauthTotal.inc({ provider: providerName, status: 'failure' });
        destroyStateCookie(response);
        response.redirect(302, oauthFrontendCallbackUrl(reason));
    };

    if (!stateMatches(cookies[OAUTH_STATE_COOKIE], query.state)) {
        recordOAuthFailure(context, providerName, 'invalid_state');
        authOauthTotal.inc({ provider: providerName, status: 'failure' });
        destroyStateCookie(response);
        rejectResponse(response, 400, [t('account.oauth.invalid-state')]);
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

    return provider
        .exchangeCode(query.code, oauthRedirectUri(provider.name))
        .then((identity) => loginOrCreateFromOAuth(provider.name, identity, context))
        .then((user) => issueSession(response, user.id, undefined, [provider.name]))
        .then(() => {
            authOauthTotal.inc({ provider: providerName, status: 'success' });
            destroyStateCookie(response);
            response.redirect(302, oauthFrontendCallbackUrl());
        })
        .catch((error: unknown) => {
            if (error instanceof OAuthEmailUnverifiedError) {
                failToFrontend('email_unverified');
                return;
            }
            // The provider/exchange detail is developer-facing only — same rule
            // `rejectDatabaseError` follows for a driver failure.
            logger.error({
                message: 'OAuth callback failed',
                provider: providerName,
                error: error instanceof Error ? error.message : String(error)
            });
            failToFrontend('provider_error');
        });
};

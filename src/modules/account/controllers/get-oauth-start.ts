/**
 * @module
 * `GET /account/oauth/:provider` controller — the one route in this module that answers a
 * redirect instead of a JSON envelope: there is no response body to negotiate, only a `Location`
 * a browser follows to the provider's consent screen.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { rejectResponse } from '@infrastructure/http/response';
import { resolveOAuthProvider } from '../oauth/providers';
import {
    generateOAuthState,
    createStateCookie,
    generateCodeVerifier,
    codeChallengeOf,
    createVerifierCookie,
    createContinueCookie,
    createLocaleCookie,
    isSameOriginPath,
    isLocaleTag
} from '../oauth/state';
import { oauthRedirectUri } from '../oauth/config';

/**
 * GET /account/oauth/:provider
 * Starts an OAuth login: mints the CSRF `state` and the PKCE verifier, sets both as cookies, and
 * redirects to the provider's consent screen with the state and the verifier's challenge. Also
 * saves `?continue=` as a cookie of its own, same idiom, when it is a same-origin relative path —
 * an invalid or absent one is dropped silently rather than refused, since this route only ever
 * answers a browser navigation with nowhere to show a JSON error. `?locale=` travels the same
 * way, so a visitor reading `/it/login` comes back to Italian.
 */
export const getOAuthStart = (request: Request, response: Response) => {
    const provider = resolveOAuthProvider(String(request.params.provider).toLowerCase());
    if (!provider) {
        // Loud, not silent — same shape as an unset `NODE_PAYMENT_PROVIDER`: a deployment that
        // never configured this provider must not pretend it exists.
        rejectResponse(response, 404, [t('account.oauth.unknown-provider')]);
        return;
    }

    const state = generateOAuthState();
    createStateCookie(response, state);

    const verifier = generateCodeVerifier();
    createVerifierCookie(response, verifier);

    if (isSameOriginPath(request.query.continue)) {
        createContinueCookie(response, request.query.continue);
    }

    if (isLocaleTag(request.query.locale)) {
        createLocaleCookie(response, request.query.locale);
    }

    const authorizeUrl = provider.authorizeUrl(
        state,
        oauthRedirectUri(provider.name),
        codeChallengeOf(verifier)
    );
    response.redirect(302, authorizeUrl);
};

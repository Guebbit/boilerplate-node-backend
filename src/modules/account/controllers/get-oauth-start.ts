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
    createVerifierCookie
} from '../oauth/state';
import { oauthRedirectUri } from '../oauth/config';

/**
 * GET /account/oauth/:provider
 * Starts an OAuth login: mints the CSRF `state` and the PKCE verifier, sets both as cookies, and
 * redirects to the provider's consent screen with the state and the verifier's challenge.
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

    const authorizeUrl = provider.authorizeUrl(
        state,
        oauthRedirectUri(provider.name),
        codeChallengeOf(verifier)
    );
    response.redirect(302, authorizeUrl);
};

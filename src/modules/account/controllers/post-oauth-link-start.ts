/**
 * @module
 * `POST /account/oauth/links/{provider}` controller — the signed-in half of connecting a sign-in
 * provider. Unlike `GET /account/oauth/:provider` it answers JSON: the caller is a signed-in client
 * that navigates the browser to the returned `authorizeUrl` itself, and the cookies it sets here
 * (state, PKCE verifier, and the `oauth-link` token naming this account) are what the callback
 * trusts when the browser comes back from the provider.
 */

import type { Request, Response } from 'express';
import { t } from '@infrastructure/i18n';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { resolveOAuthProvider } from '../oauth/providers';
import {
    generateOAuthState,
    createStateCookie,
    generateCodeVerifier,
    codeChallengeOf,
    createVerifierCookie,
    createLinkCookie,
    createContinueCookie,
    createLocaleCookie,
    isSameOriginPath,
    isLocaleTag
} from '../oauth/state';
import { oauthRedirectUri } from '../oauth/config';
import { accountService } from '../services';

/**
 * POST /account/oauth/links/{provider}
 * Starts connecting a provider to the caller's own account (fresh session required, the route
 * mounts the guard): mints the state and verifier, issues the connect token, sets all three as
 * cookies, and answers the provider's consent URL. `?continue=` and `?locale=` ride the same
 * cookies as a login so the browser lands back where the person was.
 */
export const postOAuthLinkStart = (request: Request<{ provider: string }>, response: Response) => {
    const provider = resolveOAuthProvider(request.params.provider.toLowerCase());
    if (!provider) {
        rejectResponse(response, 404, [t('account.oauth.unknown-provider')]);
        return Promise.resolve();
    }

    return accountService
        .startOAuthLink(request.authContext!.id)
        .then((linkToken) => {
            const state = generateOAuthState();
            createStateCookie(response, state);
            const verifier = generateCodeVerifier();
            createVerifierCookie(response, verifier);
            createLinkCookie(response, linkToken);
            if (isSameOriginPath(request.query.continue))
                createContinueCookie(response, request.query.continue);
            if (isLocaleTag(request.query.locale))
                createLocaleCookie(response, request.query.locale);

            successResponse(response, {
                authorizeUrl: provider.authorizeUrl(
                    state,
                    oauthRedirectUri(provider.name),
                    codeChallengeOf(verifier)
                )
            });
        })
        .catch(catchAs(response, 'postOAuthLinkStart'));
};

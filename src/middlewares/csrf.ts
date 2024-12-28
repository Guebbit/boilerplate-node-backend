import { csrfSync } from 'csrf-sync';

/**
 * CSRF protection
 * https://www.npmjs.com/package/csrf-sync
 */
export const {
    // This is just for convenience if you plan on making your own middleware.
    // invalidCsrfTokenError,
    // Use this in your routes to generate, store, and get a CSRF token.
    generateToken,
    // Use this to retrieve the token submitted by a user
    getTokenFromRequest,
    // The default method for retrieving a token from state.
    getTokenFromState,
    // The default method for storing a token in state.
    storeTokenInState,
    // Revokes/deletes a token by calling storeTokenInState(undefined)
    revokeToken,
    // This is the default CSRF protection middleware.
    csrfSynchronisedProtection
} = csrfSync({
    /**
     * Normally it would retrieve the token from the headers,
     * but I have it on the request body.
     * @param req
     */
    getTokenFromRequest: (req) =>
        (req.body as {CSRFToken: string}).CSRFToken,

    // /**
    //  *
    //  */
    // ignoredMethods: ["GET", "HEAD", "OPTIONS"],
    //
    // /**
    //  * Used to retrieve the token from state.
    //  * @param req
    //  */
    // getTokenFromState: (req) => {
    //     return req.session.csrfToken;
    // },
    //
    // /**
    //  * Used to retrieve the token submitted by the request from headers
    //  * @param req
    //  */
    // getTokenFromRequest: (req) =>  {
    //     return req.headers['x-csrf-token'];
    // },
    //
    // /**
    //  * Used to store the token in state.
    //  *
    //  * @param req
    //  * @param token
    //  */
    // storeTokenInState: (req, token) => {
    //     req.session.csrfToken = token;
    // },
    //
    // /**
    //  * The size of the generated tokens in bits
    //  */
    // size: 128,
});
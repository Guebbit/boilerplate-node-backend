/**
 * The analytics event names only a CLIENT can emit.
 *
 * The analytics twin of `./asyncapi.workers.yaml`, and its mirror image. That file holds the
 * channels no domain owns because they never leave this service; this one holds the names no
 * module owns because this service never observes the moment they describe. A server is always
 * started, so it has no `app_started`; a logout is a token the browser discards, with no request
 * to attribute it to; and a checkout request that never arrived is, from here, indistinguishable
 * from one that was never made.
 *
 * WHY THEY ARE DECLARED HERE AT ALL. Both repos write into one Umami website, so the event names
 * form ONE namespace across the two. Declaring the client's half here is what makes that namespace
 * have an owner: `contract-bundles.test.ts` checks every name in this file against every name the
 * modules declare, so a client name can never collide with a server one. `npm run contracts:bundle`
 * publishes this file — and only this file — as the catalogue the frontend imports.
 *
 * WHAT IS DELIBERATELY MISSING. There is no `declare module` augmentation here, unlike every
 * `src/modules/<name>/analytics.ts`. That absence is load-bearing: it keeps these names out of
 * `AnalyticsEventMap`, so `emitAnalyticsEvent` REJECTS them and this service cannot emit a client
 * event even by accident. The rule the split enforces — track on the server what the server knows,
 * track on the client only what the client alone knows — is a compile error here rather than a
 * convention.
 */

export const frontendAnalyticsEvents = {
    // Application lifecycle — there is no "app started" on a server that is always started.
    APP_STARTED: 'app_started',
    APP_READY: 'app_ready',

    // Logging out is a client-side token discard; the API has no request to attribute it to.
    USER_LOGGED_OUT: 'user_logged_out',

    // The checkout request that never reached the API — a dropped connection, a request that
    // failed to leave the browser. NOT the twin of `checkout_failed`, which is the server
    // REJECTING a checkout it received and can name a reason for. Two different facts, and the
    // reason they carry two names: merging them would put an outage and a declined card in one
    // bucket, and only one of them is a product problem.
    CHECKOUT_REQUEST_FAILED: 'checkout_request_failed'
} as const;

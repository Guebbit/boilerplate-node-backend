/**
 * @module
 * The demo webhook sink's SSRF exemption — a test double, never shipped. The sink (`webhook-tester`
 * behind its TLS proxy, or the frontend's own Cypress listener) is on loopback or a private compose
 * address, which the SSRF guard refuses for everyone else. A process that loads the dev preload
 * registers the sink's origin here, so production code has no exemption of its own.
 *
 * The WHOLE origin, port included: a sink on `:3070` does not open the rest of that machine.
 * Registered by `./register`.
 */

import { registerSsrfExemptOrigin } from '@infrastructure/adapters/ssrf-exemptions';
import { currentEnvironment } from '@infrastructure/config/store';

/**
 * Exempt the configured sink's origin from the guard's address check. Does nothing when
 * `NODE_WEBHOOK_DEMO_SINK_URL` is unset or not a URL: no sink, no exemption.
 */
export const registerWebhookSinkExemption = (): void => {
    const sinkUrl = (currentEnvironment().NODE_WEBHOOK_DEMO_SINK_URL ?? '').trim();
    if (!URL.canParse(sinkUrl)) return;
    // WHATWG URL: `.origin` is scheme, host and port, with a default port left out.
    // https://url.spec.whatwg.org/#dom-url-origin
    registerSsrfExemptOrigin(new URL(sinkUrl).origin);
};

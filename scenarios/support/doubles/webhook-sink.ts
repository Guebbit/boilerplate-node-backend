/**
 * @module
 * The demo webhook sink's SSRF exemption and TLS trust — a test double, never shipped. The sink (`webhook-tester`
 * behind its TLS proxy, or the frontend's own Cypress listener) is on loopback or a private compose
 * address, which the SSRF guard refuses for everyone else. A process that loads the dev preload
 * registers the sink's origin here, so production code has no exemption of its own.
 *
 * The WHOLE origin, port included: a sink on `:3070` does not open the rest of that machine.
 * The same gate adds the sink's test CA to the process's trusted roots, so no launcher has to set
 * `NODE_EXTRA_CA_CERTS`: no sink, no exemption, no trust. Registered by `./register`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { registerSsrfExemptOrigin } from '@infrastructure/adapters/ssrf-exemptions';
import { currentEnvironment } from '@infrastructure/config/store';

/**
 * The committed test CA that signed the sink's leaf certificate.
 */
const SINK_CA_PATH = path.join(__dirname, '../tls/webhook-sink-ca.pem');

/**
 * Adds the sink's CA to the roots this process trusts, once.
 * ADDS to the defaults: a bare `[pem]` would drop the public roots and break every other call.
 */
const trustSinkCertificateAuthority = (): void => {
    const pem = readFileSync(SINK_CA_PATH, 'utf8').trim();
    // Node >= 24.5: lists the roots a TLS client trusts right now.
    // https://nodejs.org/api/tls.html#tlsgetcacertificatestype
    const defaults = tls.getCACertificates('default');
    if (defaults.some((root) => root.trim() === pem)) return;
    // Node >= 24.5: replaces the process-wide default roots, for every later TLS connection
    // (including `fetch`). https://nodejs.org/api/tls.html#tlssetdefaultcacertificatescerts
    tls.setDefaultCACertificates([...defaults, pem]);
};

/**
 * Exempt the configured sink's origin from the guard's address check, and trust its test CA. Does
 * nothing when `NODE_WEBHOOK_DEMO_SINK_URL` is unset or not a URL: no sink, no exemption.
 */
export const registerWebhookSinkExemption = (): void => {
    const sinkUrl = (currentEnvironment().NODE_WEBHOOK_DEMO_SINK_URL ?? '').trim();
    if (!URL.canParse(sinkUrl)) return;
    // WHATWG URL: `.origin` is scheme, host and port, with a default port left out.
    // https://url.spec.whatwg.org/#dom-url-origin
    registerSsrfExemptOrigin(new URL(sinkUrl).origin);
    trustSinkCertificateAuthority();
};

/**
 * @module
 * The signature discipline every PSP webhook shares: an HMAC over `<timestamp>.<raw body>`, sent
 * in one header, compared in constant time, and refused once the timestamp is too old to be a
 * live delivery. Its own file because both halves are needed in different places — providers
 * verify, the demo and the tests sign — and because a real provider's own verifier
 * (`stripe.webhooks.constructEvent`) replaces the verify half while this stays the reference for
 * what it has to do.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Where the signature travels. Lower-case: Node normalises incoming header names. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-payment-signature';

/**
 * How far out of date a delivery may be and still be acted on. Replays older than this are
 * refused even when the signature is valid — a captured body stays valid forever otherwise, and
 * the event-id ledger only stops a SECOND settlement, not a first one that arrives late.
 */
const TOLERANCE_SECONDS = 300;

/**
 * A delivery this application refuses to act on — an unverifiable signature, but also (thrown
 * elsewhere, by `providers/fake.ts`) an unparseable body or an event carrying no id. Answered 400,
 * never 500 — see the controller. Named for what it IS, not for the one case this file itself
 * throws it for: the controller logs `error.message` as the headline, and a class named after only
 * the signature case would make that message look like a lie for the other two.
 */
export class WebhookRejected extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WebhookRejected';
    }
}

/** The signing secret, read fresh so a rotation needs no restart.
 *
 * @throws {Error} when absent — verifying against an empty secret would authenticate every
 *   caller, which is worse than authenticating none.
 */
const secret = (): string => {
    const value = process.env.NODE_PAYMENT_WEBHOOK_SECRET ?? '';
    if (!value) throw new Error('NODE_PAYMENT_WEBHOOK_SECRET is not set');
    return value;
};

/** The hex digest of `<timestamp>.<body>` under the shared secret. */
const digest = (timestamp: number, rawBody: Buffer): string =>
    createHmac('sha256', secret()).update(`${timestamp}.`).update(rawBody).digest('hex');

/**
 * Produce the header a provider would send. Used by the demo's own deliveries and by the tests
 * that exercise the webhook route — there is no other way to build a delivery that verifies.
 *
 * @param rawBody - the exact bytes that will be sent as the body
 * @param timestamp - unix seconds; defaults to now
 */
export const signWebhookPayload = (
    rawBody: Buffer | string,
    timestamp: number = Math.floor(Date.now() / 1000)
): string => {
    const buffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    return `t=${timestamp},v1=${digest(timestamp, buffer)}`;
};

/**
 * Verify a signature header against the bytes that arrived.
 *
 * @param rawBody - the body exactly as received, never a re-serialised object
 * @param header - the header value, verbatim
 * @throws {WebhookRejected} when the header is malformed, stale, or does not match
 */
export const verifyWebhookSignature = (rawBody: Buffer, header: string | undefined): void => {
    const parts = new Map(
        (header ?? '').split(',').map((pair) => {
            const index = pair.indexOf('=');
            return [pair.slice(0, index).trim(), pair.slice(index + 1).trim()] as const;
        })
    );

    const timestamp = Number(parts.get('t'));
    const provided = parts.get('v1') ?? '';
    if (!Number.isFinite(timestamp) || !provided)
        throw new WebhookRejected('Malformed signature header');

    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TOLERANCE_SECONDS)
        throw new WebhookRejected('Signature timestamp outside tolerance');

    const expected = Buffer.from(digest(timestamp, rawBody), 'hex');
    const actual = Buffer.from(provided, 'hex');
    // Length is checked first because `timingSafeEqual` throws on a mismatch rather than
    // answering false — and a wrong length is already a wrong signature.
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new WebhookRejected('Signature does not match');
};

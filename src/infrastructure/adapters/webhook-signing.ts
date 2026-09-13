/**
 * @module
 * Standard Webhooks (https://www.standardwebhooks.com) signing and verification, hand-rolled over
 * `node:crypto` rather than the `standardwebhooks` npm package — the format is the interoperable
 * part, worth being exact about; the thirty-odd lines of HMAC around it are not worth a dependency.
 *
 * Wire format:       `webhook-id`, `webhook-timestamp` (unix seconds), `webhook-signature`.
 * Signed content:     exactly `${id}.${timestamp}.${body}`, over the RAW body bytes — this file
 *                      never re-serializes JSON, callers pass the exact bytes that were/will be sent.
 * Signature value:    `v1,<base64(hmac-sha256)>`, space-separated when a secret ring is active —
 *                      one `v1,...` per secret, so a rotation keeps both old and new consumers
 *                      verifying during the overlap.
 * Secret encoding:    a secret is base64 (an optional `whsec_` prefix, matching the ecosystem's own
 *                      convention, is stripped before decoding) — decoded to raw bytes, which are
 *                      the HMAC key. Not the ecosystem's SDK, but the same on-wire secret shape, so
 *                      a secret generated here verifies against any Standard Webhooks-compatible
 *                      library and vice versa.
 *
 * This file's own unit tests assert against the spec's own published example — the `sign function
 * works` fixture in
 * https://github.com/standard-webhooks/standard-webhooks/blob/main/libraries/javascript/src/webhook.test.ts
 * — byte-for-byte, not just self-consistency.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Replay-protection default: a delivery outside this many seconds of "now" is refused. */
const DEFAULT_TOLERANCE_SECONDS = 300;

/** The `whsec_` prefix a secret may carry, stripped before base64-decoding. Not required here. */
const SECRET_PREFIX = 'whsec_';

/** The three headers a Standard Webhooks delivery carries, and nothing else. */
export interface WebhookSignatureHeaders {
    /** The event/delivery id — becomes the `id` segment of the signed content. */
    'webhook-id': string;
    /** Unix seconds, as a string (the wire format is always a string header). */
    'webhook-timestamp': string;
    /** One `v1,<base64>` per active secret, space-separated. */
    'webhook-signature': string;
}

/** What {@link signWebhookPayload} needs: the delivery identity, the exact bytes, and the ring. */
export interface SignWebhookPayloadInput {
    /** The event/delivery id sent as `webhook-id` and folded into the signed content. */
    id: string;
    /**
     * When this delivery is dated. A `Date` for callers with one already in hand; a bare `number`
     * is unix seconds, so a test can pin one without constructing a `Date`. Defaults to now.
     */
    timestamp?: Date | number;
    /** The exact bytes to sign — the caller's already-serialized JSON body, never re-serialized here. */
    body: string | Buffer;
    /** Active secrets, plaintext. Every one signs; sign with more than one only during a rotation. */
    secrets: string[];
}

/** What {@link verifyWebhookSignature} needs to decide whether a delivery is genuine. */
export interface VerifyWebhookSignatureInput {
    /** The `webhook-id` header value, verbatim. */
    id: string;
    /** The `webhook-timestamp` header value — a `Date`, or unix seconds as sent on the wire. */
    timestamp: Date | number;
    /** The body exactly as received, never a re-serialized object. */
    body: string | Buffer;
    /** The raw `webhook-signature` header value — one or more space-separated `v1,<base64>` entries. */
    signatureHeader: string | undefined;
    /** Every secret currently accepted for this endpoint — a ring, so a rotation verifies both. */
    secrets: string[];
    /** Replay window in seconds. Default: {@link DEFAULT_TOLERANCE_SECONDS} (5 minutes). */
    toleranceSeconds?: number;
}

/** A `Date` or unix-seconds value, resolved to unix seconds. `undefined` means "now". */
const toUnixSeconds = (timestamp: Date | number | undefined): number =>
    timestamp === undefined
        ? Math.floor(Date.now() / 1000)
        : timestamp instanceof Date
          ? Math.floor(timestamp.getTime() / 1000)
          : timestamp;

/**
 * A signing secret as raw HMAC key bytes.
 *
 * Strips the `whsec_` prefix when present — Standard Webhooks secrets carry it, ours are not
 * required to — then base64-decodes the remainder. Decoding, not the UTF-8 bytes of the string
 * itself, is what makes a secret generated here interoperable with the spec's own libraries.
 */
const decodeSecret = (secret: string): Buffer =>
    Buffer.from(
        secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
        'base64'
    );

/**
 * The `v1,<base64>` signature for one secret over one signed payload.
 *
 * Split out as its own step (SOLID: one responsibility) so both {@link signWebhookPayload} (one
 * call per ring secret) and {@link verifyWebhookSignature} (one call per candidate secret) share
 * the exact same signed-content construction — the single place `${id}.${timestamp}.${body}` is
 * written.
 *
 * @param id - the delivery id
 * @param timestampSeconds - unix seconds
 * @param body - the exact bytes signed
 * @param secretBytes - the decoded HMAC key
 * @returns `v1,<base64 hmac>`
 */
const computeV1Signature = (
    id: string,
    timestampSeconds: number,
    body: string | Buffer,
    secretBytes: Buffer
): string => {
    // node:crypto HMAC: https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options
    // `.update` accepts the id/timestamp prefix as a string and the body as whatever it already
    // is (string or Buffer) — concatenating first would force a needless re-encoding of the body.
    const hmac = createHmac('sha256', secretBytes).update(`${id}.${timestampSeconds}.`);
    hmac.update(body);
    return `v1,${hmac.digest('base64')}`;
};

/**
 * Sign a webhook delivery for every secret in the ring.
 *
 * One `v1,...` value per secret, space-separated in the single `webhook-signature` header — the
 * spec's own documented mechanism for a secret rotation: a consumer verifying against either the
 * old or the new secret accepts the delivery during the overlap.
 *
 * @returns the three headers to send with the delivery
 */
export const signWebhookPayload = (
    input: SignWebhookPayloadInput
): { headers: WebhookSignatureHeaders } => {
    const timestampSeconds = toUnixSeconds(input.timestamp);
    const signatures = input.secrets
        .map((secret) =>
            computeV1Signature(input.id, timestampSeconds, input.body, decodeSecret(secret))
        )
        .join(' ');

    return {
        headers: {
            'webhook-id': input.id,
            'webhook-timestamp': timestampSeconds.toString(),
            'webhook-signature': signatures
        }
    };
};

/**
 * One `v1,<base64>` entry from a `webhook-signature` header, compared against one candidate
 * signature in constant time.
 *
 * `timingSafeEqual` THROWS on unequal-length buffers rather than answering false — a forged or
 * truncated header is exactly the case that must not throw past this function, so length is
 * checked first and a mismatch reads as "no match" rather than an escaping exception.
 *
 * @param provided - one space-separated entry from the header, e.g. `v1,abcd...`
 * @param expected - the `v1,<base64>` this candidate secret computes
 */
const signatureEntryMatches = (provided: string, expected: string): boolean => {
    if (!provided.startsWith('v1,')) return false;

    const providedBytes = Buffer.from(provided.slice('v1,'.length), 'base64');
    const expectedBytes = Buffer.from(expected.slice('v1,'.length), 'base64');
    if (providedBytes.length !== expectedBytes.length) return false;

    // https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b — constant-time comparison,
    // never `===`, so a signature check can't leak how many leading bytes matched via timing.
    return timingSafeEqual(providedBytes, expectedBytes);
};

/**
 * Verify a delivery: every candidate secret against every signature entry in the header, plus the
 * replay-protection timestamp window.
 *
 * Accepts when ANY secret's computed signature matches ANY entry in the header — the ring means a
 * delivery signed under either the old or the new secret during a rotation must verify.
 *
 * @returns `true` only when the timestamp is within tolerance AND at least one signature matches
 */
export const verifyWebhookSignature = (input: VerifyWebhookSignatureInput): boolean => {
    if (!input.signatureHeader) return false;

    const timestampSeconds = toUnixSeconds(input.timestamp);
    const toleranceSeconds = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
    if (Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > toleranceSeconds) return false;

    const providedEntries = input.signatureHeader.split(' ');
    return input.secrets.some((secret) => {
        const expected = computeV1Signature(
            input.id,
            timestampSeconds,
            input.body,
            decodeSecret(secret)
        );
        return providedEntries.some((entry) => signatureEntryMatches(entry, expected));
    });
};

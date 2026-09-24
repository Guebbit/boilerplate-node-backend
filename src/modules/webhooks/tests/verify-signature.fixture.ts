/**
 * @module
 * Verifies a Standard Webhooks-signed delivery — for tests only, shared by `tests/unit/webhook-signing.test.ts`
 * (the sign/verify round trip) and `tests/integration/delivery.test.ts` (a real signed request).
 *
 * Written independently of `../transport/webhook-signing.ts`'s `signWebhookPayload`, rather than
 * sharing its private helpers: a passing round-trip test is a claim about interop with the spec,
 * not merely that one function reverses itself. Not part of the production module's surface —
 * this codebase only ever sends webhooks, never receives one to verify.
 *
 * See https://www.standardwebhooks.com — `signWebhookPayload`'s own docblock already spells out
 * the wire format in full.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Replay-protection default, matching `webhook-signing.ts`'s own. */
const DEFAULT_TOLERANCE_SECONDS = 300;

/** The `whsec_` prefix a secret may carry, stripped before base64-decoding. */
const SECRET_PREFIX = 'whsec_';

/** What {@link verifyWebhookSignatureForTest} needs to decide whether a delivery is genuine. */
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

/** A `Date` or unix-seconds value, resolved to unix seconds. */
const toUnixSeconds = (timestamp: Date | number): number =>
    timestamp instanceof Date ? Math.floor(timestamp.getTime() / 1000) : timestamp;

/** A signing secret as raw HMAC key bytes — strips the optional `whsec_` prefix, then base64-decodes. */
const decodeSecret = (secret: string): Buffer =>
    Buffer.from(
        secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
        'base64'
    );

/** The `v1,<base64>` signature one candidate secret computes over one signed payload. */
const computeV1Signature = (
    id: string,
    timestampSeconds: number,
    body: string | Buffer,
    secretBytes: Buffer
): string => {
    // node:crypto HMAC: https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options
    const hmac = createHmac('sha256', secretBytes).update(`${id}.${timestampSeconds}.`);
    hmac.update(body);
    return `v1,${hmac.digest('base64')}`;
};

/**
 * One `v1,<base64>` entry from a `webhook-signature` header, compared against one candidate
 * signature in constant time.
 *
 * `timingSafeEqual` THROWS on unequal-length buffers rather than answering false, so length is
 * checked first and a mismatch reads as "no match" rather than an escaping exception.
 */
const signatureEntryMatches = (provided: string, expected: string): boolean => {
    if (!provided.startsWith('v1,')) return false;

    const providedBytes = Buffer.from(provided.slice('v1,'.length), 'base64');
    const expectedBytes = Buffer.from(expected.slice('v1,'.length), 'base64');
    if (providedBytes.length !== expectedBytes.length) return false;

    // https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b — constant-time comparison.
    return timingSafeEqual(providedBytes, expectedBytes);
};

/**
 * Verify a delivery: every candidate secret against every signature entry in the header, plus the
 * replay-protection timestamp window. Accepts when ANY secret's computed signature matches ANY
 * entry — the ring means a delivery signed under either the old or the new secret during a
 * rotation must verify.
 *
 * @returns `true` only when the timestamp is within tolerance AND at least one signature matches
 */
export const verifyWebhookSignatureForTest = (input: VerifyWebhookSignatureInput): boolean => {
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

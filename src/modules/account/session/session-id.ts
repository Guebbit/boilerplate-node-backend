/**
 * @module
 * The opaque session id of `cookie` mode: 32 random bytes, base64url, behind the `ses_` prefix the
 * kernel dispatches on (the same shape as an `sk_…` key). It is stored only as its sha256
 * (`@infrastructure/security/hash-token`), so a database read yields nothing a request could
 * present. 256 bits of entropy is why a fast hash is enough and no signing secret is needed.
 */

import { randomBytes } from 'node:crypto';
import { SESSION_TOKEN_PREFIX } from '@kernel/authentication';

/** A fresh session id — the only moment its plaintext exists on the server. */
export const newSessionId = (): string =>
    `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;

/**
 * Whether a presented credential is shaped like a session id. A cheap refusal before any lookup:
 * a JWT, an `sk_…` key or noise never costs a query.
 *
 * @param token - the Bearer or cookie value
 */
export const looksLikeSessionId = (token: string): boolean =>
    token.startsWith(SESSION_TOKEN_PREFIX);

/**
 * Whether a presented credential is shaped like a JWT: three base64url segments, the first the
 * `eyJ` of an encoded `{"`. Only the shape — whether it verifies is `jwt` mode's question.
 *
 * @param token - the Bearer or cookie value
 */
export const looksLikeJwt = (token: string): boolean => /^eyJ[\w-]*\.[\w-]+\.[\w-]*$/.test(token);

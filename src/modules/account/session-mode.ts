/**
 * @module
 * The two ways a deployment can keep people signed in — a leaf, so the schema (a row's `mode`),
 * the configuration (`NODE_SESSION_MODE`) and the strategies can all name them without importing
 * each other. See docs/theory/sessions.md.
 */

/**
 * `jwt`:    a short access token plus a rotating refresh token (the default).
 * `cookie`: one random session id, stored hashed, in an HttpOnly cookie or a `ses_…` bearer.
 */
export const SESSION_MODES = ['jwt', 'cookie'] as const;

/** One of {@link SESSION_MODES}. */
export type SessionMode = (typeof SESSION_MODES)[number];

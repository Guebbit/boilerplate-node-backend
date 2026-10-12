/**
 * @module
 * The one-time token kinds this module stores in `verificationtokens` — a leaf, so the schema, the
 * flows that issue the tokens and `./services/revocation`, which purges them, can all name them
 * without importing each other.
 */

/**
 * The `type` a password-reset (or account-setup) link carries.
 *
 * Named here rather than spelled at each call site because it is policy, not detail — and because
 * a bare string in a controller connects to nothing, least of all the TTL it belongs to.
 */
export const PASSWORD_RESET_TOKEN_TYPE = 'password';

/** The `type` an account-deletion confirmation link carries. */
export const ACCOUNT_DELETE_TOKEN_TYPE = 'delete';

/** The `type` of a signup or re-send verification link — proves the address the account ALREADY has. */
export const EMAIL_VERIFY_TOKEN_TYPE = 'verify';

/**
 * The `type` of an email-CHANGE link — proves the address a `PUT/PATCH /account` change has ASKED
 * FOR (`user.pendingEmail`), never the one it already has. A distinct type from
 * {@link EMAIL_VERIFY_TOKEN_TYPE}, not a reuse: spending one must not do the other's work, since a
 * signup-verify token swapping in a `pendingEmail` would be a bug with an account takeover on the
 * end of it.
 */
export const EMAIL_CHANGE_TOKEN_TYPE = 'email-change';

/**
 * The `type` of the one-time link that undoes an email change, mailed to the OLD address when the
 * change is requested. Absent from `PENDING_TOKEN_TYPES` in `./services/revocation` on purpose: a
 * password change must not take away the link a person who reads mail weekly still needs.
 */
export const EMAIL_CHANGE_UNDO_TOKEN_TYPE = 'email-change-undo';

/** The `type` of a login's second-factor challenge — see `./services/two-factor-challenge`. */
export const MFA_CHALLENGE_TOKEN_TYPE = 'mfa-challenge';

/** How long the undo link works — 7 days, long enough for someone who reads their mail weekly. */
export const EMAIL_CHANGE_UNDO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Every kind `verificationtokens.type` may hold — the schema's closed `enum`. A kind added later
 * is added here, in the one place that names them all.
 */
export const VERIFICATION_TOKEN_TYPES = [
    PASSWORD_RESET_TOKEN_TYPE,
    ACCOUNT_DELETE_TOKEN_TYPE,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    EMAIL_CHANGE_UNDO_TOKEN_TYPE,
    MFA_CHALLENGE_TOKEN_TYPE
] as const;

/** One of {@link VERIFICATION_TOKEN_TYPES}. */
export type VerificationTokenType = (typeof VERIFICATION_TOKEN_TYPES)[number];

/**
 * The kinds an account holds at most ONE live link of: issuing a new one replaces the old. The
 * schema's partial unique index covers exactly these, so replacing is one atomic upsert and two
 * simultaneous requests cannot leave two working links. A delete confirmation and an MFA challenge
 * are not here: several may be in flight at once.
 */
export const ONE_LIVE_TOKEN_TYPES: readonly VerificationTokenType[] = [
    PASSWORD_RESET_TOKEN_TYPE,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    EMAIL_CHANGE_UNDO_TOKEN_TYPE
];

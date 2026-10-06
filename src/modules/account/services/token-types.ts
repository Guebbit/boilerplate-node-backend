/**
 * @module
 * The `tokens.type` strings the account endpoints store — a leaf, so both the flows that issue the
 * tokens and `./revocation`, which purges them, can name them without importing each other.
 */

/**
 * The `tokens.type` a password-reset link carries.
 *
 * Named here rather than spelled at each call site because it is policy, not detail — and because
 * a bare string in a controller connects to nothing, least of all the TTL it belongs to.
 * `./verification` states its own pair the same way.
 */
export const PASSWORD_RESET_TOKEN_TYPE = 'password';

/**
 * The `tokens.type` an account-deletion link carries — named for the same reason as
 * {@link PASSWORD_RESET_TOKEN_TYPE}: policy, not detail, and `delete-account-confirm.ts` reads it
 * from here rather than repeating the bare string.
 */
export const ACCOUNT_DELETE_TOKEN_TYPE = 'delete';

/**
 * The `tokens.type` under which a signup/re-send verification token is stored — proves the
 * address the account ALREADY has.
 *
 * A string like `'password'` and `'delete'`, not an `TokenType` member: the enum names the two
 * types the JWT layer knows about, and this one belongs to the account endpoints alone — see the
 * note on `UserMethods.tokenAdd`.
 */
export const EMAIL_VERIFY_TOKEN_TYPE = 'verify';

/**
 * The `tokens.type` under which an email-CHANGE token is stored — proves the address a
 * `PUT/PATCH /account` change has ASKED FOR (`user.pendingEmail`), never the one it already has. A
 * distinct type from {@link EMAIL_VERIFY_TOKEN_TYPE}, not a reuse: spending one must not do the
 * other's work, since a signup-verify token swapping in a `pendingEmail` would be a bug with an
 * account takeover on the end of it.
 */
export const EMAIL_CHANGE_TOKEN_TYPE = 'email-change';

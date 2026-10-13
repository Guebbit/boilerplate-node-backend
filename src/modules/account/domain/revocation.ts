/**
 * @module
 * Every way an account's sessions end, as one table with no I/O: what each cause does and what it
 * tells subscribers. `services/revocation.ts` reads it to act; the type of the reasons an
 * `account.sessions-revoked` event can carry is derived from it, so no list is restated.
 *
 * See: docs/modules/account-sessions.md#revocation
 */

/**
 * What one cause does. Every cause ends every session of the account.
 *
 * - `epoch`:      `with-write` — the credential's own write moves the session epoch;
 *                 `own` — `revokeFor` moves it, in its own transaction.
 * - `pending`:    also purge the one-time links and challenges issued under the old credential.
 * - `announce`:   tell `account.sessions-revoked` subscribers (`api-keys` revokes what was minted).
 * - `callerKeeps`: the acting caller is re-minted in the same response.
 * - `modes`:      the session modes it applies to; refresh-token reuse only exists in `jwt`.
 */
export interface RevocationRow {
    epoch: 'with-write' | 'own';
    pending: boolean;
    announce: boolean;
    callerKeeps: boolean;
    modes: 'both' | 'jwt';
}

/** Each cause, with the literal types the derived reasons need. */
export const REVOCATION = {
    'password-change': {
        epoch: 'with-write',
        pending: true,
        announce: false,
        callerKeeps: true,
        modes: 'both'
    },
    'password-reset': {
        epoch: 'with-write',
        pending: true,
        announce: true,
        callerKeeps: false,
        modes: 'both'
    },
    'logout-all': {
        epoch: 'own',
        pending: false,
        announce: true,
        callerKeeps: false,
        modes: 'both'
    },
    'email-change-confirm': {
        epoch: 'with-write',
        pending: false,
        announce: false,
        callerKeeps: false,
        modes: 'both'
    },
    'email-change-undo': {
        epoch: 'own',
        pending: true,
        announce: true,
        callerKeeps: false,
        modes: 'both'
    },
    'two-factor-change': {
        epoch: 'with-write',
        pending: false,
        announce: false,
        callerKeeps: true,
        modes: 'both'
    },
    'refresh-reuse': {
        epoch: 'own',
        pending: false,
        announce: false,
        callerKeeps: false,
        modes: 'jwt'
    }
} as const satisfies Record<string, RevocationRow>;

/** One way sessions end — a key of {@link REVOCATION}. */
export type RevocationCause = keyof typeof REVOCATION;

/** The causes that announce `account.sessions-revoked` — the ones a subscriber treats as a compromise. */
export type SessionsRevokedReason = {
    [Cause in RevocationCause]: (typeof REVOCATION)[Cause]['announce'] extends true ? Cause : never;
}[RevocationCause];

/**
 * Whether a cause announces `account.sessions-revoked`, narrowing it to a reason.
 *
 * @param cause - the cause under test
 */
export const announces = (cause: RevocationCause): cause is SessionsRevokedReason =>
    REVOCATION[cause].announce;

/**
 * @module
 * Account — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. Here, the email-change flow's transition table and the session proof rules.
 * `epoch.ts` (the session-epoch rule) is not re-exported: `session/` imports it directly, since the
 * barrel never publishes `session/`'s token surface.
 *
 * See `docs/theory/domain-layer.md`.
 */

export {
    EMAIL_CHANGE_EVENTS,
    EMAIL_CHANGE_STATES,
    emailChangeNext,
    emailChangeStateOf,
    undoRestoresPreviousEmail
} from './email-change';
export type { EmailChangeEvent, EmailChangeFields, EmailChangeState } from './email-change';

export { AMR, firstSessionRefused, withProofs } from './session-proof';
export { REVOCATION, announces } from './revocation';
export type { RevocationCause, RevocationRow, SessionsRevokedReason } from './revocation';

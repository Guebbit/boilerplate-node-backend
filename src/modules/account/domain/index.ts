/**
 * @module
 * Account — domain layer: pure rules only, lint-guaranteed free of Express, Mongoose and every
 * tier. Here, the email-change flow's transition table.
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

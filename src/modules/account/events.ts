/**
 * @module
 * Domain events this module emits, declared in `./asyncapi.domain-events.yaml`.
 */

import type { DomainEventName } from '@kernel/events';

export type { SessionsRevokedReason } from './domain/revocation';

/** See `account.sessions_revoked` in `asyncapi.domain-events.yaml`. */
export const ACCOUNT_SESSIONS_REVOKED = 'account.sessions_revoked' satisfies DomainEventName;

/** See the `account.authenticator_removed` channel in `asyncapi.domain-events.yaml`. */
export const ACCOUNT_AUTHENTICATOR_REMOVED =
    'account.authenticator_removed' satisfies DomainEventName;

/** See the `account.analytics_consent_withdrawn` channel in `asyncapi.domain-events.yaml`. */
export const ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN =
    'account.analytics_consent_withdrawn' satisfies DomainEventName;

/** See the `account.export_failed` channel in `asyncapi.domain-events.yaml`. */
export const ACCOUNT_EXPORT_FAILED = 'account.export_failed' satisfies DomainEventName;

/** See the `account.export_ready` channel in `asyncapi.domain-events.yaml`. */
export const ACCOUNT_EXPORT_READY = 'account.export_ready' satisfies DomainEventName;

/**
 * @module
 * Domain events this module emits, declared in `./asyncapi.domain-events.yaml`.
 */

import type { DomainEventName } from '@kernel/events';

/**
 * The personal-data fields whose change is announced, named as the audit trail names them
 * (`services/audit-changes.ts`). Preferences (locale, consent) are not in it. The generated enum
 * of `user.profile_changed` (`asyncapi.domain-events.yaml`).
 */
export type { UserChangedField } from '@types';

/** See the `user.setup_requested` channel in `asyncapi.domain-events.yaml`. */
export const USER_SETUP_REQUESTED = 'user.setup_requested' satisfies DomainEventName;

/** See the `user.deactivated` channel in `asyncapi.domain-events.yaml`. */
export const USER_DEACTIVATED = 'user.deactivated' satisfies DomainEventName;

/** See the `user.deletion_canceled` channel in `asyncapi.domain-events.yaml`. */
export const USER_DELETION_CANCELED = 'user.deletion_canceled' satisfies DomainEventName;

/** See the `user.erased` channel in `asyncapi.domain-events.yaml`. */
export const USER_ERASED = 'user.erased' satisfies DomainEventName;

/** See the `user.profile_changed` channel in `asyncapi.domain-events.yaml`. */
export const USER_PROFILE_CHANGED = 'user.profile_changed' satisfies DomainEventName;

/** See the `user.review_flagged` channel in `asyncapi.domain-events.yaml`. */
export const USER_REVIEW_FLAGGED = 'user.review_flagged' satisfies DomainEventName;

/** See the `user.review_cleared` channel in `asyncapi.domain-events.yaml`. */
export const USER_REVIEW_CLEARED = 'user.review_cleared' satisfies DomainEventName;

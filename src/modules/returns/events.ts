/**
 * @module
 * Domain events this module emits, declared in `./asyncapi.domain-events.yaml`. Each one is
 * projected into `webhooks`' public catalogue by `module.ts`'s `publicEvents`.
 */

import type { DomainEventName } from '@kernel/events';

/** See the `return.requested` channel in `asyncapi.domain-events.yaml`. */
export const RETURN_REQUESTED = 'return.requested' satisfies DomainEventName;

/** See the `return.received` channel in `asyncapi.domain-events.yaml`. */
export const RETURN_RECEIVED = 'return.received' satisfies DomainEventName;

/** See the `return.closed` channel in `asyncapi.domain-events.yaml`. */
export const RETURN_CLOSED = 'return.closed' satisfies DomainEventName;

/** See the `return.decided` channel in `asyncapi.domain-events.yaml`. */
export const RETURN_DECIDED = 'return.decided' satisfies DomainEventName;

/** See the `return.closed_by_hand` channel in `asyncapi.domain-events.yaml`. */
export const RETURN_CLOSED_BY_HAND = 'return.closed_by_hand' satisfies DomainEventName;

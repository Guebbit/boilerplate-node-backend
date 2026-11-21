/**
 * @module
 * Domain events the stock alerts emit, declared in `./asyncapi.domain-events.yaml`.
 */

import type { DomainEventName } from '@kernel/events';

/** The event name, exported so an emitter and its listeners share one spelling. */
export const STOCK_ALERT_SENT = 'stock_alert.sent' satisfies DomainEventName;

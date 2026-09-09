/**
 * @module
 * Does this event match this subscription's filter — pure, no I/O. One rule: exact membership, or
 * the `'*'` wildcard opting into everything. There is no glob or prefix matching; the public event
 * catalogue is small and flat (`GET /webhooks/events`), and a pattern language would be a feature
 * with its own edge cases for a list a caller can just enumerate.
 */

/** The wildcard that subscribes to every event the catalogue names, present or future. */
export const ALL_EVENTS = '*';

/**
 * Whether `eventType` matches a subscription's `eventTypes` filter.
 *
 * @param eventType - the event being published, e.g. `order.paid`
 * @param filter - the subscription's own `eventTypes`
 */
export const matchesEventFilter = (eventType: string, filter: readonly string[]): boolean =>
    filter.includes(ALL_EVENTS) || filter.includes(eventType);

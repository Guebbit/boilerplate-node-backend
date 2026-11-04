/**
 * @module
 * `fulfillment_order.delayed` is two things at once: a to-do (the buyer may owe consent) and a
 * message to the buyer. One module holds one handler per event, so this runs both, the to-do
 * first. The to-do is idempotent by `eventId`, so a redelivery after a failed notice re-runs a
 * no-op open and writes the notice once.
 */

import type { DomainEventMap, DomainEventMeta } from '@kernel/events';
import { shopNotices } from './notices';
import { shopTasks } from './tasks';

/**
 * Open the consent reminder when one is owed, then write the buyer's notice.
 *
 * @param payload - the delay notice
 * @param meta - the event's delivery facts
 */
export const onFulfillmentOrderDelayed = (
    payload: DomainEventMap['fulfillment_order.delayed'],
    meta: DomainEventMeta
): Promise<void> =>
    shopTasks
        .onDelayed(payload, meta)
        .then(() => shopNotices.onFulfillmentOrderDelayedNotice(payload));

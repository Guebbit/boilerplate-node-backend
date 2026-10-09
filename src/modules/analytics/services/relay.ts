/**
 * @module
 * Hands a relayed browsing event to the analytics port. The consent gate is the port's own, so a
 * visitor who has not agreed is dropped there, not here.
 *
 * See: docs/modules/analytics.md
 */

import type { AnalyticsEventRequest, CallerContext } from '@types';
import { buildAnalyticsBase, emitAnalyticsEvent } from '@infrastructure/observability/analytics';

/**
 * The provider-facing properties of one relayed event, in the snake_case the provider's dashboards
 * already use for these two names.
 */
const propertiesOf = (event: AnalyticsEventRequest): Record<string, string | number | undefined> =>
    event.event === 'product_viewed'
        ? { product_id: event.productId }
        : { text: event.text, page: event.page, result_count: event.resultCount };

/**
 * Emit one relayed browsing event as the caller who sent it.
 *
 * @param event - the validated body, one of the contract's closed set
 * @param context - the caller, built once in the controller
 */
export const relayEvent = (event: AnalyticsEventRequest, context: CallerContext): void =>
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        event: event.event,
        properties: propertiesOf(event)
    });

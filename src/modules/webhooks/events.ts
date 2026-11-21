/**
 * @module
 * Domain events the webhooks module emits, declared in `./asyncapi.domain-events.yaml`. These are internal facts for sibling modules, never deliveries to a subscriber.
 */

import type { DomainEventName } from '@kernel/events';

/** See the `webhook.subscription_auto_disabled` channel in `asyncapi.domain-events.yaml`. */
export const WEBHOOK_SUBSCRIPTION_AUTO_DISABLED =
    'webhook.subscription_auto_disabled' satisfies DomainEventName;

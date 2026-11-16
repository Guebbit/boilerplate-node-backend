/**
 * @module
 * What a caller may do to a subscription or a delivery, decided here so no client re-derives the
 * rules. Every flag needs the key that names the act (`update:WebhookSubscription`,
 * `delete:WebhookSubscription`); a caller without it gets `false`. The state half of each rule is
 * read off the stored wire row, so the list adds the block without loading anything more.
 */

import { holds } from '@kernel/ability';
import type {
    TenantCaller,
    WebhookDeliveryActions,
    WebhookSubscription,
    WebhookSubscriptionActions
} from '@types';
import type { StoredWebhookSubscription } from '../repository';
import type { WebhookSubscriptionDocument } from '../model';
import { presentWebhookSubscription } from '../presenters';
import { liveRingEntries } from '../secrets';
import { unreadableEventTypes } from './catalog';

/** What the caller holds on a subscription: the two keys every flag turns on. */
export interface Standing {
    /** The caller holds `update:WebhookSubscription`. */
    update: boolean;
    /** The caller holds `delete:WebhookSubscription`. */
    delete: boolean;
    /** The caller may receive every event this filter names (`*` = all), by the catalogue's read rules. */
    reads: (eventTypes: readonly string[]) => boolean;
}

/**
 * How the caller stands to subscriptions.
 * @param caller - the caller, in tenant scope
 */
export const standingOn = (caller: TenantCaller): Standing => ({
    update: holds(caller, 'update', 'WebhookSubscription'),
    delete: holds(caller, 'delete', 'WebhookSubscription'),
    reads: (eventTypes) => unreadableEventTypes(eventTypes, caller).length === 0
});

/** The state half of a subscription's rules: the only two facts a flag reads off the record. */
interface SubscriptionState {
    /** Whether it is switched on. */
    enabled: boolean;
    /** How many secrets still sign. */
    secretCount: number;
    /** The stored event filter, which a secret minted now would sign for. */
    eventTypes: readonly string[];
}

/**
 * What the caller may do to one subscription.
 * @param state - the subscription's state half
 * @param standing - how the caller stands to it
 */
const subscriptionActions = (
    state: SubscriptionState,
    standing: Standing
): WebhookSubscriptionActions => ({
    update: standing.update,
    delete: standing.delete,
    enable: standing.update && !state.enabled,
    disable: standing.update && state.enabled,
    /** A minted secret signs for the stored filter, so the caller must be able to read all of it. */
    createSecret: standing.update && standing.reads(state.eventTypes),
    /** A ring never empties (`deleteSecret` 422s it), so a second secret must exist to drop one. */
    deleteSecret: standing.update && state.secretCount > 1
});

/**
 * A stored row from the list, with the caller's `actions` added.
 * @param row - the lean row, as the wire carries it before `actions`
 * @param standing - how the caller stands to it
 */
export const withSubscriptionActions = (
    row: StoredWebhookSubscription,
    standing: Standing
): WebhookSubscription => ({
    ...row,
    actions: subscriptionActions(
        {
            enabled: row.enabled,
            secretCount: row.secretIds.length,
            eventTypes: row.eventTypes
        },
        standing
    )
});

/**
 * One subscription document as the wire carries it, for this caller.
 * @param subscription - the document
 * @param caller - the caller, in tenant scope
 */
export const viewSubscription = (
    subscription: WebhookSubscriptionDocument,
    caller: TenantCaller
): WebhookSubscription =>
    presentWebhookSubscription(
        subscription,
        subscriptionActions(
            {
                enabled: !subscription.disabledAt,
                secretCount: liveRingEntries(subscription.secrets).length,
                eventTypes: subscription.eventTypes
            },
            standingOn(caller)
        )
    );

/**
 * What the caller may do to one delivery: replay needs `update:WebhookSubscription`, a
 * subscription that is still there and switched on, and the read rule of the delivery's event
 * (a replay re-sends the stored payload).
 * @param subscriptionEnabled - whether the delivery's subscription exists and is enabled
 * @param standing - how the caller stands to subscriptions
 */
export const deliveryActions = (
    subscriptionEnabled: boolean,
    eventType: string,
    standing: Standing
): WebhookDeliveryActions => ({
    replay: standing.update && subscriptionEnabled && standing.reads([eventType])
});

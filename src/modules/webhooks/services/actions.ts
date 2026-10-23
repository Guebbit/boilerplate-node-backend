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

/** What the caller holds on a subscription: the two keys every flag turns on. */
export interface Standing {
    /** The caller holds `update:WebhookSubscription`. */
    update: boolean;
    /** The caller holds `delete:WebhookSubscription`. */
    delete: boolean;
}

/**
 * How the caller stands to subscriptions.
 * @param caller - the caller, in tenant scope
 */
export const standingOn = (caller: TenantCaller): Standing => ({
    update: holds(caller, 'update', 'WebhookSubscription'),
    delete: holds(caller, 'delete', 'WebhookSubscription')
});

/** The state half of a subscription's rules: the only two facts a flag reads off the record. */
export interface SubscriptionState {
    /** Whether it is switched on. */
    enabled: boolean;
    /** How many secrets still sign. */
    secretCount: number;
}

/**
 * What the caller may do to one subscription.
 * @param state - the subscription's state half
 * @param standing - how the caller stands to it
 */
export const subscriptionActions = (
    state: SubscriptionState,
    standing: Standing
): WebhookSubscriptionActions => ({
    update: standing.update,
    delete: standing.delete,
    enable: standing.update && !state.enabled,
    disable: standing.update && state.enabled,
    rotateSecret: standing.update,
    // A ring never empties (`removeSecret` 422s it), so a second secret must exist to drop one.
    removeSecret: standing.update && state.secretCount > 1
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
        { enabled: row.enabled, secretCount: row.secretIds.length },
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
                secretCount: liveRingEntries(subscription.secrets).length
            },
            standingOn(caller)
        )
    );

/**
 * What the caller may do to one delivery: replay needs `update:WebhookSubscription` and a
 * subscription that is still there and switched on.
 * @param subscriptionEnabled - whether the delivery's subscription exists and is enabled
 * @param standing - how the caller stands to subscriptions
 */
export const deliveryActions = (
    subscriptionEnabled: boolean,
    standing: Standing
): WebhookDeliveryActions => ({ replay: standing.update && subscriptionEnabled });

/**
 * @module
 * The shop's side of the helpdesk. Subscribes to the shop's events and, for each, opens or clears
 * a to-do (`tasks`), writes the buyer's message or the staff's work notice (`notifications`), or
 * both; and runs the staff digest. It has no routes and no collection: `tasks` and `notifications`
 * do the writing and audit it, and their contracts grow by this module's fragments
 * (`openapi.tasks.yaml`, `openapi.notifications.yaml`, `asyncapi.notifications.yaml`).
 *
 * No producer imports this module: delete it and the shop's events simply have no listener.
 *
 * See: docs/modules/shop-tasks.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { CART_LINES_REMOVED, CART_MERGE_REFUSED } from '@modules/cart';
import {
    FULFILLMENT_ORDER_CANCELLED,
    FULFILLMENT_ORDER_DELAYED,
    FULFILLMENT_ORDER_HOLD_NOTICED,
    SHIPMENT_LOST,
    SHIPMENT_SHIPPED
} from '@modules/delivery';
import { HOLD_ORPHANED } from '@modules/inventory';
import { ORDER_CANCELLED, ORDER_PURCHASE_HOLD_PLACED } from '@modules/orders';
import {
    PAYMENT_AMOUNT_MISMATCH,
    PAYMENT_DISPUTE_OPENED,
    PAYMENT_DISPUTE_UPDATED,
    PAYMENT_REFUNDED,
    PAYMENT_REFUND_CANCELED,
    PAYMENT_REFUND_FAILED,
    PAYMENT_REFUND_OWED_BY_HAND
} from '@modules/payments';
import { RETURN_REQUESTED } from '@modules/returns';
import { STOCK_ALERT_SENT } from '@modules/stock-alerts';
import { WISHLIST_ITEMS_REMOVED } from '@modules/wishlist';
import { shopTasksConfig } from './config';
import { shopTasksJobs } from './jobs';
import { shopTasksService } from './services';

/** This module's manifest entry: event subscriptions, the digest jobs, config, locales and the digest template. */
export default {
    name: 'shop-tasks',
    config: [shopTasksConfig.slice],
    jobs: shopTasksJobs,
    // Writes through `tasks` and `notifications`, which export and erase their own rows.
    personalData: 'none',
    subscribe: () => {
        // The to-dos: each situation's opening event and the event that ends it.
        onDomainEvent(PAYMENT_REFUND_OWED_BY_HAND, shopTasksService.onRefundOwedByHand);
        onDomainEvent(PAYMENT_REFUND_FAILED, shopTasksService.onRefundFailed);
        onDomainEvent(PAYMENT_REFUNDED, shopTasksService.onRefundClosed);
        onDomainEvent(PAYMENT_REFUND_CANCELED, shopTasksService.onRefundClosed);
        onDomainEvent(PAYMENT_AMOUNT_MISMATCH, shopTasksService.onAmountMismatch);
        onDomainEvent(PAYMENT_DISPUTE_OPENED, shopTasksService.onDispute);
        onDomainEvent(PAYMENT_DISPUTE_UPDATED, shopTasksService.onDispute);
        onDomainEvent(HOLD_ORPHANED, shopTasksService.onHoldOrphaned);
        onDomainEvent(ORDER_CANCELLED, shopTasksService.onOrderCancelled);
        onDomainEvent(SHIPMENT_SHIPPED, shopTasksService.onShipped);
        onDomainEvent(FULFILLMENT_ORDER_CANCELLED, shopTasksService.onFulfillmentOrderCancelled);
        // Both a to-do and a buyer's message: one handler runs the two in order.
        onDomainEvent(FULFILLMENT_ORDER_DELAYED, shopTasksService.onFulfillmentOrderDelayed);

        // The notices: a buyer's message or a staff member's work notice.
        onDomainEvent(CART_LINES_REMOVED, shopTasksService.onCartLinesRemoved);
        onDomainEvent(WISHLIST_ITEMS_REMOVED, shopTasksService.onWishlistItemsRemoved);
        onDomainEvent(CART_MERGE_REFUSED, shopTasksService.onCartMergeRefused);
        onDomainEvent(STOCK_ALERT_SENT, shopTasksService.onStockAlertSent);
        onDomainEvent(
            FULFILLMENT_ORDER_HOLD_NOTICED,
            shopTasksService.onFulfillmentOrderHoldNoticed
        );
        onDomainEvent(SHIPMENT_LOST, shopTasksService.onShipmentLost);
        onDomainEvent(ORDER_PURCHASE_HOLD_PLACED, shopTasksService.onPurchaseHoldPlaced);
        onDomainEvent(RETURN_REQUESTED, shopTasksService.onReturnRequested);
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;

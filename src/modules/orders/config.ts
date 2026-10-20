/**
 * @module
 * The order rules (withdrawal window, retention, line caps) and this module's one link into the
 * paired frontend. All read per call
 * rather than captured at import, the pattern `inventory/config.ts` sets, so a test can vary any
 * of them per case. A deployment corrects one with a restart.
 *
 * The shop's own identity, currency and return address live in `shop`.
 * VAT rates:              not here; `products` resolves them and `orders` only freezes the number.
 * Order link:             owned here, because `infrastructure/http/frontend-link.ts` does not know
 *                         `orders` exists (see `docs/theory/layers.md`).
 *
 * See: docs/modules/orders.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { email, int, text } from '@infrastructure/config/fields';
import { frontendLink } from '@infrastructure/http/frontend-link';
import { shopIdentity } from '@modules/shop';
import { createOrderBodyItemsMax, createOrderBodyItemsItemQuantityMax } from '@api/schemas.zod';

/** The rules an order lives by. */
export const ordersConfig = defineConfig({
    name: 'orders',
    shape: {
        NODE_ADMIN_ORDER_MAX_LINES: int({ default: 100, min: 1 }),
        NODE_ADMIN_ORDER_MAX_LINE_QUANTITY: int({ default: 99_999, min: 1 }),
        NODE_WITHDRAWAL_PERIOD_DAYS: int({ default: 30, min: 21 }),
        NODE_ORDER_PII_RETENTION_DAYS: int({ default: 3653, min: 1 }),
        NODE_ORDER_EVENT_TEXT_RETENTION_DAYS: int({ default: 1095, min: 1 }),
        NODE_ORDER_EXPORT_MAX_ROWS: int({ default: 20_000, min: 1 }),
        NODE_PURCHASE_HOLD_CANCEL_COUNT: int({ default: 3, min: 2 }),
        NODE_PURCHASE_HOLD_WINDOW_DAYS: int({ default: 7, min: 1 }),
        NODE_STAFF_NOTIFY_EMAIL: email(),
        NODE_FRONTEND_LINK_ORDER: text({ default: 'orders/{id}' })
    }
});

/**
 * How many lines an admin-created order may carry: `NODE_ADMIN_ORDER_MAX_LINES`, never above the
 * contract's ceiling. A value over the ceiling has no effect (the schema refuses first).
 * @returns the line cap
 */
export const maxAdminOrderLines = (): number =>
    Math.min(ordersConfig().NODE_ADMIN_ORDER_MAX_LINES, createOrderBodyItemsMax);

/**
 * The largest quantity one line of an admin-created order may ask for:
 * `NODE_ADMIN_ORDER_MAX_LINE_QUANTITY`, never above the contract's ceiling.
 * @returns the quantity cap
 */
export const maxAdminOrderLineQuantity = (): number =>
    Math.min(
        ordersConfig().NODE_ADMIN_ORDER_MAX_LINE_QUANTITY,
        createOrderBodyItemsItemQuantityMax
    );

/**
 * How many days a consumer has to withdraw. The law's floor is 14 (Consumer Rights Directive
 * Art. 9); the minimum here is 21 so a weekend or holiday roll-over can never matter. Read per
 * call, like every getter here.
 * See docs/modules/orders.md#the-withdrawal-window
 * @returns the withdrawal period, in days
 */
export const withdrawalPeriodDays = (): number => ordersConfig().NODE_WITHDRAWAL_PERIOD_DAYS;

/**
 * Days a terminal order's personal data is kept before the sweep erases it.
 * @returns the retention, in days
 */
export const orderPiiRetentionDays = (): number => ordersConfig().NODE_ORDER_PII_RETENTION_DAYS;

/**
 * Days a timeline row keeps the free text staff wrote on it, counted from the row's own instant.
 * Its own clock because the order's starts only at erasure or inactivity, so a live customer's
 * text would otherwise never go.
 * @returns the retention, in days
 */
export const orderEventTextRetentionDays = (): number =>
    ordersConfig().NODE_ORDER_EVENT_TEXT_RETENTION_DAYS;

/**
 * The most orders one CSV export may carry. Over it the export answers 422 and asks for narrower
 * filters: a bounded file, and a bounded cursor on the primary.
 * @returns the cap, in rows
 */
export const orderExportMaxRows = (): number => ordersConfig().NODE_ORDER_EXPORT_MAX_ROWS;

/**
 * A link into the paired frontend's own order page. The default template is the frontend's own
 * route (`<paired-frontend>/src/modules/orders/routes.ts`); `{id}` is filled in by
 * `frontendLink`, never left for the frontend to parse out of the path itself.
 * @param parameters - `locale` the email is written in; `id` the order to link to
 */
export const orderFrontendLink = (parameters: { locale: string; id: string }): string =>
    frontendLink(ordersConfig().NODE_FRONTEND_LINK_ORDER, parameters.locale, {
        id: parameters.id
    });

/**
 * How many of a buyer's own cancellations, inside the window, pause their checkout. The minimum is
 * 2: one cancellation is an ordinary change of mind, never a pattern.
 * See docs/modules/orders.md#the-purchase-hold
 * @returns the cancellation count that triggers a hold
 */
export const purchaseHoldCancelCount = (): number => ordersConfig().NODE_PURCHASE_HOLD_CANCEL_COUNT;

/**
 * The window, in days, those cancellations are counted in.
 * @returns the window length in days
 */
export const purchaseHoldWindowDays = (): number => ordersConfig().NODE_PURCHASE_HOLD_WINDOW_DAYS;

/**
 * Where staff are told a hold was placed: `NODE_STAFF_NOTIFY_EMAIL`, else the shop's own address.
 * Mirrors the contact form's mailbox (`NODE_CONTACT_NOTIFY_EMAIL`), which is one more address for
 * a different job.
 * @returns the mailbox
 */
export const staffNotifyEmail = (): string =>
    ordersConfig().NODE_STAFF_NOTIFY_EMAIL ?? shopIdentity().email;

/**
 * @module
 * The bank-transfer payment method's deployment config, the order rules (withdrawal window,
 * retention, line caps) and this module's one link into the paired frontend. All read per call
 * rather than captured at import, the pattern `inventory/config.ts` sets, so a test can vary any
 * of them per case. A deployment corrects one with a restart.
 *
 * The shop's own identity, currency and return address live in `shop`.
 * Bank transfer:          owned here, since `orders` renders `transferInstructions`.
 *                         `payments` and `cart` read it through
 *                         `services/index.ts` (a barrel may never publish a bare `config`).
 * VAT rates:              not here; `products` resolves them and `orders` only freezes the number.
 * Order link:             owned here, because `infrastructure/http/frontend-link.ts` does not know
 *                         `orders` exists (see `docs/theory/layers.md`).
 *
 * See: docs/modules/orders.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int, text } from '@infrastructure/config/fields';
import { frontendLink } from '@infrastructure/http/frontend-link';
import type { OrderTransferInstructions } from '@types';
import { createOrderBodyItemsMax, createOrderBodyItemsItemQuantityMax } from '@api/schemas.zod';

/** How the shop takes a transfer, and the rules an order lives by. */
export const ordersConfig = defineConfig({
    name: 'orders',
    shape: {
        NODE_BANK_TRANSFER_BENEFICIARY: text(),
        NODE_BANK_TRANSFER_IBAN: text(),
        NODE_BANK_TRANSFER_BIC: text(),
        NODE_BANK_TRANSFER_HOLD_HOURS: int({ default: 168, min: 1 }),
        NODE_ADMIN_ORDER_MAX_LINES: int({ default: 100, min: 1 }),
        NODE_ADMIN_ORDER_MAX_LINE_QUANTITY: int({ default: 99_999, min: 1 }),
        NODE_ORDER_EFFECT_RETRY_MINUTES: int({ default: 5, min: 0 }),
        NODE_WITHDRAWAL_PERIOD_DAYS: int({ default: 30, min: 21 }),
        NODE_ORDER_PII_RETENTION_DAYS: int({ default: 3650, min: 1 }),
        NODE_ORDER_EVENT_TEXT_RETENTION_DAYS: int({ default: 1095, min: 1 }),
        NODE_ORDER_EXPORT_MAX_ROWS: int({ default: 20_000, min: 1 }),
        NODE_FRONTEND_LINK_ORDER: text({ default: 'orders/{id}' })
    }
});

/**
 * The account name a transfer should be made out to. Unset means transfer is not offered at all.
 * @returns the configured beneficiary, or `undefined`
 */
export const bankTransferBeneficiary = (): string | undefined =>
    ordersConfig().NODE_BANK_TRANSFER_BENEFICIARY;

/**
 * The account IBAN, exactly as configured — whatever shape it was typed in, spaces included.
 * `payments`' boot check runs it through `ibantools`' own `electronicFormatIBAN` before
 * validating, so this getter does no normalising of its own.
 * @returns the configured IBAN, or `undefined`
 */
export const bankTransferIban = (): string | undefined => ordersConfig().NODE_BANK_TRANSFER_IBAN;

/**
 * The IBAN grouped into 4-character blocks, the way a bank's own transfer form shows one — what
 * the customer actually copies. Not `ibantools`' `friendlyFormatIBAN`: that call belongs beside
 * the validation it pairs with, in `payments`, and duplicating the package's one import here would
 * cost `ibantools` its single-module ownership on the generated
 * `docs/tools/package-dependencies.md` page, for a four-character chunking rule with no edge case
 * to get wrong.
 * @returns the grouped IBAN, or `undefined` when none is configured
 */
export const bankTransferIbanFriendly = (): string | undefined => {
    const iban = bankTransferIban();
    return iban
        ?.replaceAll(/\s+/g, '')
        .replaceAll(/(.{4})/g, '$1 ')
        .trim();
};

/**
 * The account's BIC/SWIFT code — optional even once transfer is offered, since a domestic IBAN
 * is often enough on its own.
 * @returns the configured BIC, or `undefined`
 */
export const bankTransferBic = (): string | undefined => ordersConfig().NODE_BANK_TRANSFER_BIC;

/**
 * How long checkout holds stock for a `bank_transfer` order before the reservation sweep
 * releases it — a week by default, since a transfer is not a same-day action the way a card is.
 * @returns the hold window, in hours
 */
export const bankTransferHoldHours = (): number => ordersConfig().NODE_BANK_TRANSFER_HOLD_HOURS;

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
 * Whether this deployment offers `bank_transfer` at all — both the beneficiary and the IBAN must
 * be set. `GET /payments/methods` reads this; checkout refuses the method when it is `false`.
 * @returns `true` once both are configured
 */
export const bankTransferEnabled = (): boolean =>
    Boolean(bankTransferBeneficiary() && bankTransferIban());

/**
 * The bank-transfer instructions block for one order's own reference — read live off current
 * config rather than anything frozen at checkout, same reasoning as `applyTransferInstructions`'s
 * docblock in `model.ts`. Pure construction only: whether transfer is still offered, whether the
 * order is still payable, and whether it even has a reference are each caller's own guard, run
 * before this is ever called.
 * @param reference - the order's own RF reference, minted at checkout by `buildReference`
 * @returns the instructions block — `bic` present only when configured
 */
export const transferInstructionsFor = (reference: string): OrderTransferInstructions => {
    const bic = bankTransferBic();
    return {
        // Both proven present by the caller's own guard (beneficiary/IBAN configured) before this
        // ever runs — the `!` narrows what that guard already checked, not what this can't see.
        beneficiary: bankTransferBeneficiary()!,
        iban: bankTransferIbanFriendly()!,
        ...(bic ? { bic } : {}),
        reference
    };
};

/**
 * How long a cancelled order's refund gets before `sweep:order-effects` retries it.
 * A grace window, not a deadline: the refund normally settles milliseconds after the cancel, and
 * this only has to outlast a slow one. Read per call, like every other getter here, so a test
 * can vary it per case.
 * @returns the grace window in minutes
 */
export const orderEffectRetryMinutes = (): number => ordersConfig().NODE_ORDER_EFFECT_RETRY_MINUTES;

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

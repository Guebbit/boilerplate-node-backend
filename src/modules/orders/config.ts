/**
 * @module
 * The shop's own jurisdiction, the bank-transfer payment method's deployment config, and this
 * module's one link into the paired frontend (its own order page) — all read per call rather than
 * captured at import, the pattern `inventory/config.ts` sets, so a deployment can correct any of
 * them without a restart.
 *
 * The shop's own LEGAL identity for invoicing (legal name, VAT number, street address) lives in
 * `@modules/invoicing`'s own `config.ts`, not here — only `shopCountry` stays, since it is also
 * the VAT-jurisdiction and ship-to-country assumption `orders`/`cart` enforce at checkout, not an
 * invoice-only fact. The bank-transfer values are owned here because `orders` renders
 * `transferInstructions` on its own responses AND enforces the open-transfer cap at order
 * creation, so a business rule about how many pending transfers one account may hold belongs with
 * the entity it constrains, not in `infrastructure`. `payments` and `cart` read these through
 * `services/index.ts`'s re-export (a module's public barrel may only publish services/domain/
 * events/emails/model, never a bare `config` — see `local/barrel-allowed-sources`); the VAT RATES
 * are a different thing with a different owner — `products` resolves those
 * (`@modules/products`'s `config.ts`), and this module only freezes the number it is handed. The
 * order link is owned here because `infrastructure/http/frontend-link.ts` only turns a resolved
 * template into a URL, and does not know `orders` exists — see `docs/theory/layers.md` for why
 * infrastructure may not know a module by name.
 */

import { environmentNumber } from '@infrastructure/runtime/environment';
import { frontendLink } from '@infrastructure/http/frontend-link';
import type { OrderTransferInstructions } from '@types';

/**
 * The shop's own country — the ONLY jurisdiction VAT is ever charged at: no destination lookup,
 * no per-customer address, legal below the EU's €10,000 distance-selling threshold. Required at
 * boot via this module's manifest; read defensively regardless, since `NODE_ENV=test` and the demo
 * profile both skip that check.
 * @returns the configured ISO-3166 country code, or `undefined`
 */
export const shopCountry = (): string | undefined => process.env.NODE_SHOP_COUNTRY || undefined;

/**
 * Which ISO-3166 countries this deployment will ship a physical order to — checkout refuses
 * (422) any method that `requiresAddress` once the resolved address's country falls outside it.
 * Comma-separated; each code is upper-cased so a deployment typing `it` still matches an address
 * stored as `IT`. Defaults to the shop's own country alone: ship only where the VAT assumption in
 * this file's own docblock already holds, until a deployment explicitly widens it.
 * @returns the configured list, upper-cased; empty when neither this nor `NODE_SHOP_COUNTRY` is set
 */
export const shipToCountries = (): string[] => {
    const raw = process.env.NODE_SHIP_TO_COUNTRIES;
    if (raw)
        return raw
            .split(',')
            .map((code) => code.trim().toUpperCase())
            .filter(Boolean);
    const shop = shopCountry();
    return shop ? [shop] : [];
};

/**
 * The one ISO-4217 currency this deployment trades in — frozen onto every order, and every
 * payment `payments` stamps at intent time. Owned here, not in `payments`, for the same reason
 * the bank-transfer values are: `orders` freezes it first, and `payments` already depends on
 * `orders` for `markPaid`. `invoicing` freezes the SAME value again from its own event listener,
 * never re-reading this getter once an invoice is issued. A shop that ever needs a second
 * currency needs a real design, not several modules quietly reading the same env var.
 * @returns the configured ISO-4217 currency code
 */
export const shopCurrency = (): string => process.env.NODE_DEFAULT_CURRENCY ?? 'EUR';

/**
 * An order's own frozen currency, falling back to the shop's current one only for an order that
 * predates the field — a live order always has its own. The one place that fallback is decided,
 * so every service pricing an existing order (a payment intent, an invoice, a confirmation email)
 * reads the same answer rather than repeating the `??` at each call site.
 * @param order - anything carrying the order's own optional frozen currency
 * @returns the ISO-4217 code money arithmetic against this order should use
 */
export const orderCurrency = (order: { currency?: string }): string =>
    order.currency ?? shopCurrency();

/**
 * The account name a transfer should be made out to. Unset means transfer is not offered at all.
 * @returns the configured beneficiary, or `undefined`
 */
export const bankTransferBeneficiary = (): string | undefined =>
    process.env.NODE_BANK_TRANSFER_BENEFICIARY || undefined;

/**
 * The account IBAN, exactly as configured — whatever shape it was typed in, spaces included.
 * `payments`' boot check runs it through `ibantools`' own `electronicFormatIBAN` before
 * validating, so this getter does no normalising of its own.
 * @returns the configured IBAN, or `undefined`
 */
export const bankTransferIban = (): string | undefined =>
    process.env.NODE_BANK_TRANSFER_IBAN || undefined;

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
export const bankTransferBic = (): string | undefined =>
    process.env.NODE_BANK_TRANSFER_BIC || undefined;

/**
 * How long checkout holds stock for a `bank_transfer` order before the reservation sweep
 * releases it — a week by default, since a transfer is not a same-day action the way a card is.
 * @returns the hold window, in hours
 */
export const bankTransferHoldHours = (): number =>
    environmentNumber('NODE_BANK_TRANSFER_HOLD_HOURS', 168, 1);

/**
 * How many of one account's orders may sit `pending` on a transfer at once. A week-long hold is
 * otherwise free to take — this is what stops one account hoarding stock across many
 * uncompleted orders.
 * @returns the cap on open transfer orders per account
 */
export const bankTransferMaxOpenPerAccount = (): number =>
    environmentNumber('NODE_BANK_TRANSFER_MAX_OPEN_PER_ACCOUNT', 2, 0);

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
 * How long a cancelled order's refund gets before `scripts/ops/sweep-order-effects.ts` retries it.
 * A grace window, not a deadline: the refund normally settles milliseconds after the cancel, and
 * this only has to outlast a slow one. Read per call, like every other getter here, so a change
 * applies to the next sweep tick and a test can vary it per case.
 * @returns the grace window in minutes
 */
export const orderEffectRetryMinutes = (): number =>
    environmentNumber('NODE_ORDER_EFFECT_RETRY_MINUTES', 5, 0);

/** This module's env var for its one frontend link — `.env-example` documents the default. */
const ORDER_LINK_ENV_VAR = 'NODE_FRONTEND_LINK_ORDER';

/**
 * Default template — the paired frontend's own order page
 * (`<paired-frontend>/src/modules/orders/routes.ts`). `{id}` is filled in by
 * `frontendLink`, never left for the frontend to parse out of the path itself.
 */
const ORDER_LINK_DEFAULT_TEMPLATE = 'orders/{id}';

/**
 * A link into the paired frontend's own order page.
 * @param parameters - `locale` the email is written in; `id` the order to link to
 */
export const orderFrontendLink = (parameters: { locale: string; id: string }): string =>
    frontendLink(
        process.env[ORDER_LINK_ENV_VAR] ?? ORDER_LINK_DEFAULT_TEMPLATE,
        parameters.locale,
        {
            id: parameters.id
        }
    );

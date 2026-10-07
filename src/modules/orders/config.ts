/**
 * @module
 * The shop's identity (who it is, where it is, how to reach it, where returned goods go), the
 * bank-transfer payment method's deployment config, and this module's one link into the paired
 * frontend. All read per call rather than captured at import, the pattern `inventory/config.ts`
 * sets, so a test can vary any of them per case. A deployment corrects one with a restart.
 *
 * Owner of the identity:  `orders`, because `invoicing`, `delivery` and `returns` all import
 *                         `orders` and `orders` may not import them back.
 * Bank transfer:          owned here, since `orders` renders `transferInstructions` and caps open
 *                         transfers at creation. `payments` and `cart` read it through
 *                         `services/index.ts` (a barrel may never publish a bare `config`).
 * VAT rates:              not here; `products` resolves them and `orders` only freezes the number.
 * Order link:             owned here, because `infrastructure/http/frontend-link.ts` does not know
 *                         `orders` exists (see `docs/theory/layers.md`).
 *
 * See: docs/modules/orders.md
 */

import { ConfigError, defineConfig } from '@infrastructure/config/define';
import { choice, csv, email, int, text } from '@infrastructure/config/fields';
import { currencyConfig } from '@infrastructure/runtime/config';
import { frontendLink } from '@infrastructure/http/frontend-link';
import type { OrderTransferInstructions } from '@types';

/** Who pays to send returned goods back. */
export const RETURN_POSTAGE_PAYERS = ['consumer', 'shop'] as const;

/** Who pays to send returned goods back: the customer, or the shop. */
export type ReturnPostagePayer = (typeof RETURN_POSTAGE_PAYERS)[number];

/**
 * What the shop is, where it is, and how it takes a transfer.
 *
 * The legal name, address, email and phone are required at boot: the invoice and the withdrawal
 * notice both print them, and a notice with no address on it is not one (CRD Art. 6(1)(c)). The VAT
 * number and the return address stay optional.
 */
export const ordersConfig = defineConfig({
    name: 'orders',
    shape: {
        NODE_SHOP_COUNTRY: text({
            required: { minLength: 1 },
            describe: 'The shop’s own country, ISO-3166: the only jurisdiction VAT is charged at.'
        }),
        NODE_SHOP_LEGAL_NAME: text({
            required: { minLength: 1 },
            describe: 'The shop’s legal name, printed on invoices and the withdrawal notice.'
        }),
        NODE_SHOP_VAT_NUMBER: text({
            describe: 'VAT identification number. Unset prints none rather than a fake one.'
        }),
        NODE_SHOP_STREET: text({
            required: { minLength: 1 },
            describe: 'The shop’s street address (invoice Art. 226(f); CRD Art. 6(1)(c)).'
        }),
        NODE_SHOP_CITY: text({ required: { minLength: 1 }, describe: 'The shop’s city.' }),
        NODE_SHOP_ZIP: text({ required: { minLength: 1 }, describe: 'The shop’s postal code.' }),
        NODE_SHOP_EMAIL: email({
            required: { minLength: 1 },
            describe:
                'The address a customer writes to (CRD Art. 6(1)(c)). Not the no-reply sender.'
        }),
        NODE_SHOP_PHONE: text({
            required: { minLength: 1 },
            describe: 'The shop’s telephone number (CRD Art. 6(1)(c), since the Omnibus Directive).'
        }),
        NODE_RETURN_ADDRESS_NAME: text({ describe: 'Who the return parcel is addressed to.' }),
        NODE_RETURN_ADDRESS_STREET: text({ describe: 'Return address street.' }),
        NODE_RETURN_ADDRESS_CITY: text({ describe: 'Return address city.' }),
        NODE_RETURN_ADDRESS_ZIP: text({ describe: 'Return address postal code.' }),
        NODE_RETURN_ADDRESS_COUNTRY: text({
            case: 'upper',
            describe: 'Return address country, ISO-3166 alpha-2.'
        }),
        NODE_RETURN_POSTAGE_PAYER: choice(RETURN_POSTAGE_PAYERS, {
            default: 'consumer',
            describe: 'Who bears the direct cost of returning goods. Drives the withdrawal wording.'
        }),
        NODE_SHIP_TO_COUNTRIES: csv({
            case: 'upper',
            describe:
                'Countries a physical order may ship to, ISO-3166, comma-separated. Unset: the shop’s own.'
        }),
        NODE_BANK_TRANSFER_BENEFICIARY: text({
            describe:
                'Account name a transfer is made out to. Unset with the IBAN: transfer is not offered.'
        }),
        NODE_BANK_TRANSFER_IBAN: text({ describe: 'Account IBAN, validated at boot.' }),
        NODE_BANK_TRANSFER_BIC: text({ describe: 'Account BIC/SWIFT. Optional.' }),
        NODE_BANK_TRANSFER_HOLD_HOURS: int({
            default: 168,
            min: 1,
            describe: 'Hours stock is held for an unpaid transfer order.'
        }),
        NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT: int({
            default: 2,
            min: 1,
            describe:
                'Unpaid (pending) orders one account may hold at once, whatever the payment method. Each holds stock, so this is what stops one account taking the shelf. 2 lets a failed card be retried; a strict shop sets 1.'
        }),
        NODE_ORDER_EFFECT_RETRY_MINUTES: int({
            default: 5,
            min: 0,
            describe: 'Grace before the sweep retries a cancelled order’s refund.'
        }),
        NODE_WITHDRAWAL_PERIOD_DAYS: int({
            default: 30,
            min: 21,
            describe:
                'Days a consumer may withdraw. At least 21: the law’s 14, plus room for any weekend or holiday roll-over, which is not computed.'
        }),
        NODE_ORDER_PII_RETENTION_DAYS: int({
            default: 3650,
            min: 1,
            describe: 'Days before a terminal order’s personal data is erased.'
        }),
        NODE_FRONTEND_LINK_ORDER: text({
            default: 'orders/{id}',
            describe: 'Template of the link to an order page.'
        })
    }
});

/**
 * The shop's own country — the ONLY jurisdiction VAT is ever charged at: no destination lookup,
 * no per-customer address, legal below the EU's €10,000 distance-selling threshold. Required at
 * boot via this module's manifest; read defensively regardless, since `NODE_ENV=test` skips that
 * check — the demo profile does not: it sets `NODE_SHOP_COUNTRY` itself, the same as any other
 * deployment must.
 * @returns the configured ISO-3166 country code, or `undefined`
 */
export const shopCountry = (): string | undefined => ordersConfig().NODE_SHOP_COUNTRY;

/**
 * A required variable's value. `NODE_ENV=test` skips the boot check, so a suite that forgot to
 * set one gets this refusal instead of a silent `undefined` on a legal notice.
 * @param name - the variable, for the message
 * @param value - what the slice parsed
 * @returns the value
 * @throws {ConfigError} when it is unset
 */
const requiredValue = (name: string, value: string | undefined): string => {
    if (value === undefined)
        throw new ConfigError(`Invalid configuration (orders): ${name} is required`);
    return value;
};

/** Where and who the shop is: the trader identity of CRD Art. 6(1)(b)-(c) and an invoice's seller block. */
export interface ShopIdentity {
    /** The legal name, as registered. */
    legalName: string;
    /** VAT identification number; absent for a shop below the registration threshold. */
    vatNumber?: string;
    street: string;
    city: string;
    zip: string;
    /** ISO-3166 alpha-2. */
    country: string;
    /** Where a customer writes to. */
    email: string;
    /** Telephone number. */
    phone: string;
}

/**
 * The shop's identity — every required field present, the VAT number only when set.
 * @returns the identity
 * @throws {ConfigError} when a required variable is unset (only possible under `NODE_ENV=test`)
 */
export const shopIdentity = (): ShopIdentity => {
    const config = ordersConfig();
    const vatNumber = config.NODE_SHOP_VAT_NUMBER;
    return {
        legalName: requiredValue('NODE_SHOP_LEGAL_NAME', config.NODE_SHOP_LEGAL_NAME),
        ...(vatNumber ? { vatNumber } : {}),
        street: requiredValue('NODE_SHOP_STREET', config.NODE_SHOP_STREET),
        city: requiredValue('NODE_SHOP_CITY', config.NODE_SHOP_CITY),
        zip: requiredValue('NODE_SHOP_ZIP', config.NODE_SHOP_ZIP),
        country: requiredValue('NODE_SHOP_COUNTRY', config.NODE_SHOP_COUNTRY),
        email: requiredValue('NODE_SHOP_EMAIL', config.NODE_SHOP_EMAIL),
        phone: requiredValue('NODE_SHOP_PHONE', config.NODE_SHOP_PHONE)
    };
};

/** Where returned goods go. */
export interface ReturnAddress {
    /** Who the parcel is addressed to. */
    name?: string;
    street: string;
    city: string;
    zip: string;
    /** ISO-3166 alpha-2. */
    country: string;
}

/**
 * Where returned goods are sent: the configured return address, or the shop's legal address when
 * none is fully set. Partial config reads as none rather than guessed at: a customer told to post
 * a parcel to "Via Roma, " is worse off than one sent to the legal address.
 * @returns the address; never `undefined`
 */
export const returnAddress = (): ReturnAddress => {
    const {
        NODE_RETURN_ADDRESS_STREET: street,
        NODE_RETURN_ADDRESS_CITY: city,
        NODE_RETURN_ADDRESS_ZIP: zip,
        NODE_RETURN_ADDRESS_COUNTRY: country,
        NODE_RETURN_ADDRESS_NAME: name
    } = ordersConfig();
    if (street && city && zip && country)
        return { ...(name ? { name } : {}), street, city, zip, country };

    const legal = shopIdentity();
    return {
        name: legal.legalName,
        street: legal.street,
        city: legal.city,
        zip: legal.zip,
        country: legal.country
    };
};

/**
 * Who bears the direct cost of returning the goods. The consumer by default — Consumer Rights
 * Directive Art. 14(1) permits it, IF they were told beforehand, which is why this value also
 * drives the wording of the placed-order email and the withdrawal acknowledgement. A deployment
 * that offers free returns sets it to `shop`.
 * @returns `consumer` (default) or `shop`
 */
export const returnPostagePayer = (): ReturnPostagePayer =>
    ordersConfig().NODE_RETURN_POSTAGE_PAYER;

/**
 * Which ISO-3166 countries this deployment will ship a physical order to — checkout refuses
 * (422) any method that `requiresAddress` once the resolved address's country falls outside it.
 * Comma-separated; each code is upper-cased so a deployment typing `it` still matches an address
 * stored as `IT`. Defaults to the shop's own country alone: ship only where the VAT assumption in
 * this file's own docblock already holds, until a deployment explicitly widens it.
 * @returns the configured list, upper-cased; empty when neither this nor `NODE_SHOP_COUNTRY` is set
 */
export const shipToCountries = (): string[] => {
    const configured = ordersConfig().NODE_SHIP_TO_COUNTRIES;
    if (configured.length > 0) return configured;
    const shop = shopCountry();
    return shop ? [shop] : [];
};

/**
 * The one ISO-4217 currency this deployment trades in — frozen onto every order, and every
 * payment `payments` stamps at intent time. The variable itself is the infrastructure's
 * `currencyConfig`, shared with `products`; this getter is the order-side door to it. `invoicing` freezes the SAME value again from its own event listener,
 * never re-reading this getter once an invoice is issued. A shop that ever needs a second
 * currency needs a real design, not several modules quietly reading the same env var.
 * @returns the configured ISO-4217 currency code
 */
export const shopCurrency = (): string => currencyConfig().NODE_DEFAULT_CURRENCY;

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
 * How many of one account's orders may sit unpaid (`pending`) at once, whatever the payment method.
 * Every one holds stock, for 15 minutes by card and a week by bank transfer or a `processing` card,
 * so this is what stops one account hoarding the shelf across many uncompleted orders (OWASP
 * automated threat OAT-021, Denial of Inventory).
 *
 * 2 and not 1: a failed card, or a closed 3-D Secure window, leaves a `pending` order until its
 * hold expires, and with 1 the retry would be refused meanwhile.
 * @returns the cap on open unpaid orders per account
 */
export const maxOpenUnpaidOrdersPerAccount = (): number =>
    ordersConfig().NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT;

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
 * A link into the paired frontend's own order page. The default template is the frontend's own
 * route (`<paired-frontend>/src/modules/orders/routes.ts`); `{id}` is filled in by
 * `frontendLink`, never left for the frontend to parse out of the path itself.
 * @param parameters - `locale` the email is written in; `id` the order to link to
 */
export const orderFrontendLink = (parameters: { locale: string; id: string }): string =>
    frontendLink(ordersConfig().NODE_FRONTEND_LINK_ORDER, parameters.locale, {
        id: parameters.id
    });

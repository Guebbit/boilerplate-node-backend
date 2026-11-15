/**
 * @module
 * The shop's settings, read live off {@link shopConfig}: the readers every sibling module asks
 * ("which country do we charge VAT in", "where do returns go"), and the one public read of the lot,
 * `GET /shop`'s body.
 *
 * @see docs/modules/shop.md
 */

import { ConfigError } from '@infrastructure/config/define';
import { minorUnitExponent } from '@domain-primitives/money';
import { dayInZone, startOfDayInZone } from '@domain-primitives/time';
import type { ReturnPostagePayer, Shop, ShopAddress } from '@types';
import { operatorIdentity } from '@modules/account';
import { shopConfig } from './config';

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
        throw new ConfigError(`Invalid configuration (shop): ${name} is required`);
    return value;
};

/**
 * The shop's own country — the ONLY jurisdiction VAT is ever charged at: no destination lookup,
 * no per-customer address, legal below the EU's €10,000 distance-selling threshold. It is the
 * operator's country (`NODE_LEGAL_COUNTRY`, required at boot by `account`).
 * @returns the configured ISO-3166 country code
 * @throws {ConfigError} when it is unset (only possible under `NODE_ENV=test`)
 */
export const shopCountry = (): string => operatorIdentity().country;

/**
 * The shop's own time zone — whose calendar every year-numbered series, and every "day" a report
 * counts, follows. One named zone (not a fixed offset, which ignores summer time) so a sale at
 * 00:30 on 1 January in Rome lands in the new year's series. Required at boot via this module's
 * manifest; the throw is the same `NODE_ENV=test` backstop {@link traderPhone} has.
 * @returns the canonical IANA zone name, e.g. `Europe/Rome`
 * @throws {ConfigError} when it is unset (only possible under `NODE_ENV=test`)
 */
export const shopTimezone = (): string =>
    requiredValue('NODE_SHOP_TIMEZONE', shopConfig().NODE_SHOP_TIMEZONE);

/**
 * The shop-calendar day an instant falls in: how a stored promise date goes on the wire.
 * @param instant - a stored promise date, always a shop midnight
 * @returns `YYYY-MM-DD`
 */
export const shopDayOf = (instant: Date): string => dayInZone(instant, shopTimezone());

/**
 * The instant a shop-calendar day starts: how a day staff typed is stored.
 * @param day - `YYYY-MM-DD`, already checked by the request schema
 * @returns the shop's midnight of that day
 */
export const startOfShopDay = (day: string): Date => startOfDayInZone(day, shopTimezone());

/**
 * The operator's telephone number, which the withdrawal form's "To" row prints. Optional on the
 * site, required with the shop: boot refuses without it (see `config.ts`).
 * @returns the number
 * @throws {ConfigError} when it is unset (only possible under `NODE_ENV=test`)
 */
export const traderPhone = (): string =>
    requiredValue('NODE_LEGAL_PHONE', operatorIdentity().phone);

/**
 * Where returned goods are sent: the configured return address, or the operator's postal address
 * when none is fully set. Partial config reads as none rather than guessed at: a customer told to post
 * a parcel to "Via Roma, " is worse off than one sent to the legal address.
 * @returns the address; never `undefined`
 */
export const returnAddress = (): ShopAddress => {
    const {
        NODE_RETURN_ADDRESS_STREET: street,
        NODE_RETURN_ADDRESS_CITY: city,
        NODE_RETURN_ADDRESS_ZIP: zip,
        NODE_RETURN_ADDRESS_COUNTRY: country,
        NODE_RETURN_ADDRESS_NAME: name
    } = shopConfig();
    if (street && city && zip && country)
        return { ...(name ? { name } : {}), street, city, zip, country };

    const legal = operatorIdentity();
    return {
        name: legal.legalName,
        street: legal.street,
        city: legal.city,
        zip: legal.zip,
        country: legal.country
    };
};

/**
 * A postal address on one line, skipping whatever is absent — how a mail prints the shop's own
 * address (the return address, the legal one).
 * @param address - the address to print
 */
export const addressLine = (address: ShopAddress): string =>
    [address.name, address.street, `${address.zip} ${address.city}`, address.country]
        .filter(Boolean)
        .join(', ');

/**
 * Who bears the direct cost of returning the goods. The consumer by default — Consumer Rights
 * Directive Art. 14(1) permits it, IF they were told beforehand, which is why this value also
 * drives the wording of the placed-order email and the withdrawal acknowledgement. A deployment
 * that offers free returns sets it to `shop`.
 * @returns `consumer` (default) or `shop`
 */
export const returnPostagePayer = (): ReturnPostagePayer => shopConfig().NODE_RETURN_POSTAGE_PAYER;

/**
 * Which ISO-3166 countries this deployment will ship a physical order to — checkout refuses
 * (422) any method that `requiresAddress` once the resolved address's country falls outside it.
 * Comma-separated; the config has already upper-cased and shape-checked each code. Defaults to the operator's country alone: ship only where the VAT assumption in
 * {@link shopCountry}'s docblock already holds, until a deployment explicitly widens it.
 * @returns the configured list; the shop's own country alone when none is set
 */
export const shipToCountries = (): string[] => {
    const configured = shopConfig().NODE_SHIP_TO_COUNTRIES;
    if (configured.length > 0) return configured;
    return [shopCountry()];
};

/**
 * The one ISO-4217 currency this deployment trades in — frozen onto every order and every payment
 * at the moment they are made, and what `products` quotes a price in. A shop that ever needs a
 * second currency needs a real design, not several modules quietly reading the same variable.
 * @returns the configured ISO-4217 currency code
 */
export const shopCurrency = (): string => shopConfig().NODE_DEFAULT_CURRENCY;

/**
 * Days a buyer is promised when a backorder names no restock date (CRD Art. 18(1), FTC 435.2). A
 * legal value, not a setting: orders freeze it into `promisedAt`, and every screen that says
 * "ships within N days" reads it from `GET /shop`.
 */
export const BACKORDER_PROMISE_DAYS = 30;

/**
 * What `GET /shop` answers: the currency, where the shop ships, where returns go, who pays the
 * postage and the backorder promise. The time zone is published too, for naming the calendar a
 * promised day belongs to. The legal identity and the Terms version are `GET /config`'s. Not
 * published: the bank details (those travel per order).
 * @returns the public shop record
 * @throws {ConfigError} when a required variable is unset (only possible under `NODE_ENV=test`)
 */
export const getShop = (): Shop => ({
    currency: shopCurrency(),
    minorUnits: minorUnitExponent(shopCurrency()),
    shipToCountries: shipToCountries(),
    returnAddress: returnAddress(),
    returnPostagePayer: returnPostagePayer(),
    backorderPromiseDays: BACKORDER_PROMISE_DAYS,
    timeZone: shopTimezone()
});

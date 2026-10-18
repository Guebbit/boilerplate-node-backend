/**
 * @module
 * The shop's settings, read live off {@link shopConfig}: the readers every sibling module asks
 * ("which country do we charge VAT in", "where do returns go"), and the one public read of the lot,
 * `GET /shop`'s body.
 *
 * See: docs/modules/shop.md
 */

import { ConfigError } from '@infrastructure/config/define';
import type { Shop, ShopAddress } from '@types';
import { shopConfig } from './config';
import type { ReturnPostagePayer } from './domain';

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
 * no per-customer address, legal below the EU's €10,000 distance-selling threshold. Required at
 * boot via this module's manifest; read defensively regardless, since `NODE_ENV=test` skips that
 * check — the demo profile does not: it sets `NODE_SHOP_COUNTRY` itself, the same as any other
 * deployment must.
 * @returns the configured ISO-3166 country code, or `undefined`
 */
export const shopCountry = (): string | undefined => shopConfig().NODE_SHOP_COUNTRY;

/**
 * The shop's own time zone — whose calendar every year-numbered series, and every "day" a report
 * counts, follows. One named zone (not a fixed offset, which ignores summer time) so a sale at
 * 00:30 on 1 January in Rome lands in the new year's series. Required at boot via this module's
 * manifest; the throw is the same `NODE_ENV=test` backstop {@link shopIdentity} has.
 * @returns the canonical IANA zone name, e.g. `Europe/Rome`
 * @throws {ConfigError} when it is unset (only possible under `NODE_ENV=test`)
 */
export const shopTimezone = (): string =>
    requiredValue('NODE_SHOP_TIMEZONE', shopConfig().NODE_SHOP_TIMEZONE);

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
    const config = shopConfig();
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

/**
 * Where returned goods are sent: the configured return address, or the shop's legal address when
 * none is fully set. Partial config reads as none rather than guessed at: a customer told to post
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
 * Comma-separated; each code is upper-cased so a deployment typing `it` still matches an address
 * stored as `IT`. Defaults to the shop's own country alone: ship only where the VAT assumption in
 * {@link shopCountry}'s docblock already holds, until a deployment explicitly widens it.
 * @returns the configured list, upper-cased; empty when neither this nor `NODE_SHOP_COUNTRY` is set
 */
export const shipToCountries = (): string[] => {
    const configured = shopConfig().NODE_SHIP_TO_COUNTRIES;
    if (configured.length > 0) return configured;
    const shop = shopCountry();
    return shop ? [shop] : [];
};

/**
 * The one ISO-4217 currency this deployment trades in — frozen onto every order and every payment
 * at the moment they are made, and what `products` quotes a price in. A shop that ever needs a
 * second currency needs a real design, not several modules quietly reading the same variable.
 * @returns the configured ISO-4217 currency code
 */
export const shopCurrency = (): string => shopConfig().NODE_DEFAULT_CURRENCY;

/**
 * What `GET /shop` answers: the seller's identity, the currency, where the shop ships and where
 * returns go. Everything a visitor is entitled to before a sale (CRD Art. 6(1), e-Commerce
 * Directive Art. 5). Not published: the time zone, and the bank details (those travel per order).
 * @returns the public shop record
 * @throws {ConfigError} when a required variable is unset (only possible under `NODE_ENV=test`)
 */
export const getShop = (): Shop => ({
    ...shopIdentity(),
    currency: shopCurrency(),
    shipToCountries: shipToCountries(),
    returnAddress: returnAddress(),
    returnPostagePayer: returnPostagePayer()
});

/**
 * @module
 * The shop's own settings: its time zone, where returned goods go, what it ships to and the one
 * currency it trades in. All read per call rather than captured at
 * import, the pattern `inventory/config.ts` sets, so a test can vary any of them per case. A
 * deployment corrects one with a restart.
 *
 * Owner of the identity:  `account` (`NODE_LEGAL_*`): the site's legal identity is not a shop
 *                         concept. The shop reads it, and requires the phone of it at boot.
 * Bank transfer:          not here; `payments` owns it, since it renders `transferInstructions`.
 * VAT rates:              not here; `products` resolves them and `orders` only freezes the number.
 *
 * @see docs/modules/shop.md#configuration
 */

import { defineConfig } from '@infrastructure/config/define';
import {
    choice,
    countries,
    country,
    currency,
    text,
    timeZone
} from '@infrastructure/config/fields';
import type { Environment } from '@infrastructure/config/store';
import { ReturnPostagePayer } from '@types';

/**
 * The shop's boot refusals: the operator's phone, which `account` leaves optional.
 * CRD Art. 6(1)(c), Directive 2011/83/EU as amended by 2019/2161: a distance trader states a
 * telephone number, and the withdrawal form's "To" row prints it (EUR-Lex CELEX 02011L0083).
 * @param _config - this slice's parsed values, unused
 * @param environment - the environment being judged
 * @returns the refusals; empty when the shop may boot
 */
const phoneCheck = (_config: unknown, environment: Environment): string[] =>
    environment.NODE_LEGAL_PHONE?.trim() ? [] : ['NODE_LEGAL_PHONE is required with the shop'];

/**
 * What the shop trades in and where it ships. The legal identity is `account`'s; the phone it
 * leaves optional is required here.
 */
export const shopConfig = defineConfig({
    name: 'shop',
    check: phoneCheck,
    shape: {
        NODE_SHOP_TIMEZONE: timeZone({ required: { minLength: 1 } }),
        NODE_RETURN_ADDRESS_NAME: text(),
        NODE_RETURN_ADDRESS_STREET: text(),
        NODE_RETURN_ADDRESS_CITY: text(),
        NODE_RETURN_ADDRESS_ZIP: text(),
        NODE_RETURN_ADDRESS_COUNTRY: country(),
        NODE_RETURN_POSTAGE_PAYER: choice(Object.values(ReturnPostagePayer), {
            default: 'consumer'
        }),
        NODE_SHIP_TO_COUNTRIES: countries(),
        NODE_DEFAULT_CURRENCY: currency({ default: 'EUR' })
    }
});

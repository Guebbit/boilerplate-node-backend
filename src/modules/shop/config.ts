/**
 * @module
 * The shop's own settings: who it is, where it is, how to reach it, where returned goods go,
 * what it ships to and the one currency it trades in. All read per call rather than captured at
 * import, the pattern `inventory/config.ts` sets, so a test can vary any of them per case. A
 * deployment corrects one with a restart.
 *
 * Owner of the identity:  `shop`, since none of these is an order concept — `orders`, `cart`,
 *                         `delivery`, `invoicing`, `returns`, `products` and `stats` all read them.
 * Bank transfer:          not here; `payments` owns it, since it renders `transferInstructions`.
 * VAT rates:              not here; `products` resolves them and `orders` only freezes the number.
 *
 * See: docs/modules/shop.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { choice, csv, currency, email, text, timeZone } from '@infrastructure/config/fields';
import { ReturnPostagePayer } from '@types';

/**
 * What the shop is, where it is, and what it trades in.
 *
 * The legal name, address, email and phone are required at boot: the invoice and the withdrawal
 * notice both print them, and a notice with no address on it is not one (CRD Art. 6(1)(c)). The VAT
 * number, the trade register, the registration number and the return address stay optional.
 */
export const shopConfig = defineConfig({
    name: 'shop',
    shape: {
        NODE_SHOP_COUNTRY: text({ required: { minLength: 1 } }),
        NODE_SHOP_TIMEZONE: timeZone({ required: { minLength: 1 } }),
        NODE_SHOP_LEGAL_NAME: text({ required: { minLength: 1 } }),
        NODE_SHOP_VAT_NUMBER: text(),
        NODE_SHOP_TRADE_REGISTER: text(),
        NODE_SHOP_REGISTRATION_NUMBER: text(),
        NODE_SHOP_STREET: text({ required: { minLength: 1 } }),
        NODE_SHOP_CITY: text({ required: { minLength: 1 } }),
        NODE_SHOP_ZIP: text({ required: { minLength: 1 } }),
        NODE_SHOP_EMAIL: email({ required: { minLength: 1 } }),
        NODE_SHOP_PHONE: text({ required: { minLength: 1 } }),
        NODE_RETURN_ADDRESS_NAME: text(),
        NODE_RETURN_ADDRESS_STREET: text(),
        NODE_RETURN_ADDRESS_CITY: text(),
        NODE_RETURN_ADDRESS_ZIP: text(),
        NODE_RETURN_ADDRESS_COUNTRY: text({ case: 'upper' }),
        NODE_RETURN_POSTAGE_PAYER: choice(Object.values(ReturnPostagePayer), {
            default: 'consumer'
        }),
        NODE_SHIP_TO_COUNTRIES: csv({ case: 'upper' }),
        NODE_DEFAULT_CURRENCY: currency({ default: 'EUR' })
    }
});

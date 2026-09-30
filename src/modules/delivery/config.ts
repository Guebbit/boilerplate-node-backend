/**
 * @module
 * The shop's return address — where goods are sent back to. `delivery` owns it because it already
 * owns everything carrier-facing (methods, rates, shipments): all of that stays in one module, and
 * `returns` reads the address from here rather than keeping its own copy. Read per call, like every
 * config getter in this repo, so a test can vary it per case.
 */

import { defineConfig } from '@infrastructure/config/define';
import { text } from '@infrastructure/config/fields';

/** The return address's variables. Partial config is treated as none — see {@link returnAddress}. */
export const deliveryConfig = defineConfig({
    name: 'delivery',
    shape: {
        NODE_RETURN_ADDRESS_NAME: text({ describe: 'Who the return parcel is addressed to.' }),
        NODE_RETURN_ADDRESS_STREET: text({ describe: 'Return address street.' }),
        NODE_RETURN_ADDRESS_CITY: text({ describe: 'Return address city.' }),
        NODE_RETURN_ADDRESS_ZIP: text({ describe: 'Return address postal code.' }),
        NODE_RETURN_ADDRESS_COUNTRY: text({
            upper: true,
            describe: 'Return address country, ISO-3166 alpha-2.'
        })
    }
});

/** Where returned goods go. */
export interface ReturnAddress {
    /** Who the parcel is addressed to; absent when the deployment did not set one. */
    name?: string;
    street: string;
    city: string;
    zip: string;
    /** ISO-3166 alpha-2. */
    country: string;
}

/**
 * The configured return address, or `undefined` while one is not fully set. Partial config is
 * treated as none rather than guessed at: a customer told to post a parcel to "Via Roma, " is worse
 * off than one told nothing yet.
 * @returns the address, when street, city, zip and country are all set
 */
export const returnAddress = (): ReturnAddress | undefined => {
    const {
        NODE_RETURN_ADDRESS_STREET: street,
        NODE_RETURN_ADDRESS_CITY: city,
        NODE_RETURN_ADDRESS_ZIP: zip,
        NODE_RETURN_ADDRESS_COUNTRY: country,
        NODE_RETURN_ADDRESS_NAME: name
    } = deliveryConfig();
    if (!street || !city || !zip || !country) return undefined;

    return { ...(name ? { name } : {}), street, city, zip, country };
};

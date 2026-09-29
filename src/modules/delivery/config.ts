/**
 * @module
 * The shop's return address — where goods are sent back to. `delivery` owns it because it already
 * owns everything carrier-facing (methods, rates, shipments): all of that stays in one module, and
 * `returns` reads the address from here rather than keeping its own copy. Read per call, like every
 * config getter in this repo, so a deployment corrects it without a restart.
 */

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
    const street = process.env.NODE_RETURN_ADDRESS_STREET?.trim();
    const city = process.env.NODE_RETURN_ADDRESS_CITY?.trim();
    const zip = process.env.NODE_RETURN_ADDRESS_ZIP?.trim();
    const country = process.env.NODE_RETURN_ADDRESS_COUNTRY?.trim().toUpperCase();
    if (!street || !city || !zip || !country) return undefined;

    const name = process.env.NODE_RETURN_ADDRESS_NAME?.trim();
    return { ...(name ? { name } : {}), street, city, zip, country };
};

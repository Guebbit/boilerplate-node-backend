/**
 * @module
 * The postal address fields that are personal data: the one list every module that encrypts an
 * address at rest walks (orders, delivery, the address book). Lives here, below every tier,
 * because three modules that do not all depend on each other need the same answer.
 *
 * Tied to the contract: it must equal the keys of `OrderAddress`, so a field added to the contract
 * and not listed here fails `tsc` instead of being stored as plaintext.
 */

import type { OrderAddress } from '@types';

/**
 * The address fields as written, before the contract check.
 */
const FIELDS = ['fullName', 'street', 'city', 'zip', 'country', 'phone'] as const;

/** One address field that is personal data. */
export type PostalAddressField = (typeof FIELDS)[number];

/**
 * Contract keys the list above forgot. Must be `never`: a non-empty union turns the exported
 * list's type into `never` and the assignment below stops compiling.
 */
type MissingFromList = Exclude<keyof OrderAddress, PostalAddressField>;

/**
 * Every address field that is encrypted at rest, in the order they are reported.
 * Invoicing keeps its own five on purpose: an invoice carries no phone (data minimisation).
 */
export const POSTAL_ADDRESS_FIELDS: [MissingFromList] extends [never]
    ? readonly PostalAddressField[]
    : never = FIELDS satisfies readonly (keyof OrderAddress)[];

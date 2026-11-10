/**
 * @module
 * The postal address fields that are personal data: the one list every module that encrypts an
 * address at rest walks (orders, delivery, the address book). Lives here, below every tier,
 * because three modules that do not all depend on each other need the same answer.
 *
 * The stored paths for these fields are `infrastructure/persistence/postal-address-paths.ts`, keyed
 * by `PostalAddressField`.
 *
 * Imports nothing: each module that owns an address shape ties this list to it at compile time
 * (`addresses/pii.ts`, `orders/pii.ts`), so a field added there and not here fails `tsc`.
 */

/**
 * The address fields as written.
 */
const FIELDS = ['fullName', 'street', 'city', 'zip', 'country', 'phone'] as const;

/** One address field that is personal data. */
export type PostalAddressField = (typeof FIELDS)[number];

/**
 * Every address field that is encrypted at rest, in the order they are reported.
 * Invoicing keeps its own five on purpose: an invoice carries no phone (data minimisation).
 */
export const POSTAL_ADDRESS_FIELDS: readonly PostalAddressField[] = FIELDS;

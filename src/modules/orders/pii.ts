/**
 * @module
 * Field-level encryption of the personal text an order freezes: both embedded addresses and the
 * buyer's notes. Twin of `addresses/pii.ts`, under the same `NODE_PII_ENCRYPTION_KEY` ring.
 *
 * Explicit codec, never mongoose getters/setters: a getter makes `toJSON` ship ciphertext, copying a
 * foreign subdocument double-encrypts, and a setter runs on query filters (an encrypted path in a
 * filter silently matches nothing). `orders.email` stays plaintext — login-style lookups need it.
 *
 * Writes go through `orderRepository.create` (encrypts); reads decrypt in `applyOrderTransform`'s
 * `after` hook. The AAD carries the order `_id`, so a field moved to another order fails its tag.
 * A staff note's text on the timeline is the same codec: `appendTimeline` encrypts, the presenter
 * decrypts.
 */

import type { Types } from 'mongoose';
import { encryptPii, decryptPii } from '@infrastructure/security/pii-encryption';
import { POSTAL_ADDRESS_FIELDS, type PostalAddressField } from '@domain-primitives/postal-address';
import type { OrderAddress, OrderBillingAddress } from '@types';

/**
 * Every address field of the contract's `OrderAddress` that is personal data: the shared list,
 * narrowed at compile time. A field added to the contract and not to the primitive turns the type
 * into `never`, so it fails `tsc` instead of being stored as plaintext.
 */
const ORDER_ADDRESS_PII_FIELDS: [Exclude<keyof OrderAddress, PostalAddressField>] extends [never]
    ? readonly (PostalAddressField & keyof OrderAddress)[]
    : never = POSTAL_ADDRESS_FIELDS;

/**
 * Every field an order's addresses encrypt: the shared postal fields, plus the buyer's VAT number,
 * which only the billing address carries.
 */
export type OrderAddressField = PostalAddressField | 'vatNumber';

/**
 * The fields walked for one path. The VAT number is the buyer's tax identity, personal data of a
 * sole trader, and lives on the billing address alone.
 *
 * @param path - which of the two addresses
 */
export const addressFieldsOf = (path: OrderAddressPath): readonly OrderAddressField[] =>
    path === 'billingAddress'
        ? [...ORDER_ADDRESS_PII_FIELDS, 'vatNumber']
        : ORDER_ADDRESS_PII_FIELDS;

/** The two embedded addresses an order carries. */
export type OrderAddressPath = 'shippingAddress' | 'billingAddress';

/** The paths walked on every order; both are optional on the row. */
export const ADDRESS_PATHS: readonly OrderAddressPath[] = ['shippingAddress', 'billingAddress'];

/** What {@link encryptOrderPii} reads and rewrites on an order being created. */
interface OrderPiiFields {
    shippingAddress?: OrderAddress | undefined;
    billingAddress?: OrderBillingAddress | undefined;
    notes?: string | undefined;
}

/** The associated data binding one address field to one order. */
export const addressAad = (
    path: OrderAddressPath,
    field: OrderAddressField,
    orderId: string
): string => `orders:${path}.${field}:${orderId}`;

/** The associated data binding the notes to one order. */
export const notesAad = (orderId: string): string => `orders:notes:${orderId}`;

/** The associated data binding a staff note's text to the order it was written on. */
export const timelineNoteAad = (orderId: string): string => `orders:timeline-note:${orderId}`;

/**
 * Rewrites every present field of one address with `convert`. Absent fields stay absent — the
 * optional `phone` and `vatNumber` must not become the string `"undefined"`.
 *
 * @param path - which address this is, since only the billing one carries a VAT number
 */
const mapAddress = <T extends OrderBillingAddress>(
    address: T,
    path: OrderAddressPath,
    convert: (value: string, field: OrderAddressField) => string
): T => {
    const result: T = { ...address };
    for (const field of addressFieldsOf(path)) {
        const value = address[field];
        if (value !== undefined) result[field] = convert(value, field);
    }
    return result;
};

/**
 * One order's PII encrypted — a new object, every other field untouched.
 *
 * @param data - the order about to be written
 * @param orderId - its `_id`, assigned BEFORE encrypting because it is in every AAD
 */
export const encryptOrderPii = <T extends OrderPiiFields>(data: T, orderId: Types.ObjectId): T => {
    const id = String(orderId);
    const result: T = { ...data };
    for (const path of ADDRESS_PATHS) {
        const address = data[path];
        if (address)
            result[path] = mapAddress(address, path, (value, field) =>
                encryptPii(value, addressAad(path, field, id))
            );
    }
    if (data.notes !== undefined) result.notes = encryptPii(data.notes, notesAad(id));
    return result;
};

/**
 * One stored address decrypted, for a reader that holds the ciphertext row (the invoice issuers).
 *
 * @param orderId - the order the address was written under
 */
export const decryptOrderAddress = <T extends OrderBillingAddress>(
    address: T,
    path: OrderAddressPath,
    orderId: string
): T =>
    mapAddress(address, path, (value, field) =>
        decryptPii(value, addressAad(path, field, orderId), `order ${path} ${field}`)
    );

/**
 * Decrypts a serialized order in place — what every reader sees on the wire.
 *
 * @param serialized - the order after `_id` became `id`; the id is the AAD
 */
export const decryptSerializedOrder = (serialized: Record<string, unknown>): void => {
    const id = String(serialized.id);
    for (const path of ADDRESS_PATHS) {
        // Cast: the stored shape, which this module's own writer produced.
        const address = serialized[path] as OrderBillingAddress | undefined;
        if (address) serialized[path] = decryptOrderAddress(address, path, id);
    }
    if (typeof serialized.notes === 'string')
        serialized.notes = decryptPii(serialized.notes, notesAad(id), 'order notes');
};

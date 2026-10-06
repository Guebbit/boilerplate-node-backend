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
 */

import type { Types } from 'mongoose';
import { encryptPii, decryptPii } from '@infrastructure/security/pii-encryption';

/** The two embedded addresses an order carries. */
export type OrderAddressPath = 'shippingAddress' | 'billingAddress';

/** The paths walked on every order; both are optional on the row. */
const ADDRESS_PATHS: readonly OrderAddressPath[] = ['shippingAddress', 'billingAddress'];

/** The text fields of one embedded address; `phone` alone is optional. */
interface AddressText {
    fullName: string;
    street: string;
    city: string;
    zip: string;
    country: string;
    phone?: string | undefined;
}

/** What {@link encryptOrderPii} reads and rewrites on an order being created. */
interface OrderPiiFields {
    shippingAddress?: AddressText | undefined;
    billingAddress?: AddressText | undefined;
    notes?: string | undefined;
}

/** The address fields, in one place so encrypt and decrypt walk the same list. */
const ADDRESS_FIELDS = ['fullName', 'street', 'city', 'zip', 'country', 'phone'] as const;

/** The associated data binding one address field to one order. */
const addressAad = (
    path: OrderAddressPath,
    field: (typeof ADDRESS_FIELDS)[number],
    orderId: string
): string => `orders:${path}.${field}:${orderId}`;

/** The associated data binding the notes to one order. */
const notesAad = (orderId: string): string => `orders:notes:${orderId}`;

/**
 * Rewrites every present field of one address with `convert`. Absent fields stay absent — the
 * optional `phone` must not become the string `"undefined"`.
 */
const mapAddress = <T extends AddressText>(
    address: T,
    convert: (value: string, field: (typeof ADDRESS_FIELDS)[number]) => string
): T => {
    const result: T = { ...address };
    for (const field of ADDRESS_FIELDS) {
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
            result[path] = mapAddress(address, (value, field) =>
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
export const decryptOrderAddress = <T extends AddressText>(
    address: T,
    path: OrderAddressPath,
    orderId: string
): T =>
    mapAddress(address, (value, field) =>
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
        const address = serialized[path] as AddressText | undefined;
        if (address) serialized[path] = decryptOrderAddress(address, path, id);
    }
    if (typeof serialized.notes === 'string')
        serialized.notes = decryptPii(serialized.notes, notesAad(id), 'order notes');
};

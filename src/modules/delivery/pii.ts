/**
 * @module
 * Field-level encryption of the address a shipment went to — twin of `orders/pii.ts`, under the
 * same `NODE_PII_ENCRYPTION_KEY` ring. The copy is the record of where THIS parcel went, so it is
 * personal data of its own: it dies with the order's address (`order.redacted`), and the AAD binds
 * every field to the shipment's `_id`, so a ciphertext moved to another shipment fails its tag.
 *
 * Writes: `services/cut.ts`, under the shipment's pre-allocated `_id`.
 * Reads:  `presenter.ts` alone, where the wire shape is built.
 */

import type { Types } from 'mongoose';
import { encryptPii, decryptPii } from '@infrastructure/security/pii-encryption';
import { POSTAL_ADDRESS_FIELDS, type PostalAddressField } from '@domain-primitives/postal-address';
import type { OrderAddress } from '@types';

/** The associated data binding one destination field to one shipment. */
export const destinationAad = (field: PostalAddressField, shipmentId: string): string =>
    `delivery:shipments.destination.${field}:${shipmentId}`;

/**
 * Rewrites every present field of one address with `convert`, into a fresh plain object holding
 * the six address fields and nothing else — the input may be a hydrated Mongoose subdocument, whose
 * internals must not reach the wire. Absent fields stay absent: the optional `phone` must not
 * become the string `"undefined"`.
 */
const mapDestination = (
    address: OrderAddress,
    convert: (value: string, field: PostalAddressField) => string
): OrderAddress => {
    const result: Partial<OrderAddress> = {};
    for (const field of POSTAL_ADDRESS_FIELDS) {
        const value = address[field];
        if (value !== undefined) result[field] = convert(value, field);
    }
    // Cast: the required fields are present on any address the order or a shipment stored.
    return result as OrderAddress;
};

/**
 * A destination encrypted for storage on one shipment.
 * @param address - the address in the clear
 * @param shipmentId - the shipment's own `_id`, assigned BEFORE encrypting because it is in the AAD
 */
export const encryptDestination = (
    address: OrderAddress,
    shipmentId: Types.ObjectId
): OrderAddress =>
    mapDestination(address, (value, field) =>
        encryptPii(value, destinationAad(field, String(shipmentId)))
    );

/**
 * A stored destination decrypted.
 * @param address - the stored (ciphertext) address
 * @param shipmentId - the `_id` of the shipment that holds it
 */
export const decryptDestination = (address: OrderAddress, shipmentId: string): OrderAddress =>
    mapDestination(address, (value, field) =>
        decryptPii(value, destinationAad(field, shipmentId), `shipment destination ${field}`)
    );

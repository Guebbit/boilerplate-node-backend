/**
 * @module
 * The postal address as stored: one Mongoose path definition for the six fields, used by every
 * schema that embeds an address (the address book, an order's two addresses, a shipment's
 * destination). Keyed by `PostalAddressField`, so a field added to the primitive's list and not
 * here fails `tsc`, and Mongoose's strict mode cannot silently drop it at the copy that was missed.
 *
 * The invoice buyer (`invoicing/pii.ts` `PARTY_FIELDS`) is a deliberate five-field projection and
 * keeps its own list: a new address field needs its own invoicing decision (VAT Directive
 * Art. 226, "full address"). The invoice seller is the shop's identity, a different concept.
 */

import type { SchemaDefinitionProperty } from 'mongoose';
import type { PostalAddressField } from '@domain-primitives/postal-address';

/**
 * The address paths: the five a carrier needs are required, the phone is the carrier's fallback.
 * Spread into a schema definition, or passed to `new Schema(...)` whole.
 */
export const postalAddressPaths = {
    fullName: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    zip: { type: String, required: true },
    country: { type: String, required: true },
    phone: { type: String }
} satisfies Record<PostalAddressField, SchemaDefinitionProperty>;

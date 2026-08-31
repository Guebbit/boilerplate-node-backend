/**
 * @module
 * Address book model: one document per user, keyed by `userId` — the cart's pattern, chosen over
 * an array on the user document so editing an address touches one small document, not the whole
 * account. Unlike a cart line, an entry IS addressed by itself — two entries may hold identical
 * fields and still be "home" and "office" — so subdocuments keep their own `_id`.
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';

/** A stored address-book entry. */
export interface AddressItem {
    _id?: Types.ObjectId;
    label?: string;
    fullName: string;
    street: string;
    city: string;
    zip: string;
    country: string;
    phone?: string;
    /**
     * Exactly one entry carries `true` whenever the book is non-empty — maintained by the
     * repository's writes, never trusted from the client. Named `default` because that is the
     * wire name and a mapping layer for one field is a place for the two to drift.
     */
    default: boolean;
}

/** A book id never reaches the wire. */
export interface AddressBookDocument extends Document {
    userId: Types.ObjectId;
    items: AddressItem[];
    createdAt?: Date;
    updatedAt?: Date;
}

/** Queries live in `./repository`. */
export type AddressBookModel = Model<AddressBookDocument>;

/** Mongoose subdocument schema for one address-book entry — keeps its own `_id`, see above. */
const addressItemSchema = new Schema(
    {
        label: { type: String },
        fullName: { type: String, required: true },
        street: { type: String, required: true },
        city: { type: String, required: true },
        zip: { type: String, required: true },
        country: { type: String, required: true },
        phone: { type: String },
        default: { type: Boolean, default: false }
    },
    /* `_id: true` is mongoose's default; spelled out because the WISH to have one is the whole
     * difference from the cart/wishlist line schemas next door. */
    { _id: true }
);

/*
 * An entry serializes as the contract's `Address` — `_id` renamed to `id`, like the product
 * snapshot embedded in an order line. `./services/addresses` maps entries by hand instead, so no
 * request path uses this; only `scripts/export-demo-dataset.ts`'s `toJSON()` publishes stored
 * rows through it.
 */
applySerialization(addressItemSchema);

/**
 * `unique: true` on `userId`: one book per user is a database fact, and every mutation is a
 * single `findOneAndUpdate({ userId }, …)`.
 */
export const addressBookSchema = new Schema<AddressBookDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },
        items: {
            type: [addressItemSchema],
            default: []
        }
    },
    {
        timestamps: true
    }
);

/**
 * Normalizes a serialized book: `_id` → `id`, drops `__v`. Owed to the repository factory for its
 * lean reads (see `normalize` in @infrastructure/persistence/create-repository).
 */
export const applyAddressBookTransform = applySerialization(addressBookSchema);

/** The compiled Mongoose model — what `./repository` queries against. */
export const addressBookModel = model<AddressBookDocument, AddressBookModel>(
    'AddressBook',
    addressBookSchema
);

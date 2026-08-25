import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * Address book Model
 *
 * One document per user, keyed by `userId` — the cart's pattern, chosen over an array on the
 * user document for the cart's reasons: a user response cannot leak a book it does not carry,
 * and editing an address reads and writes one small document instead of the whole account.
 * This makes `account` a module that owns a collection after all; its manifest says so.
 *
 * Unlike a cart line, an entry IS addressed by itself — two entries may hold identical fields
 * and still be "home" and "office" — so the subdocuments keep their `_id`, and that id is the
 * handle every endpoint takes.
 */

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

/** Address book Document interface. A book id never reaches the wire. */
export interface AddressBookDocument extends Document {
    userId: Types.ObjectId;
    items: AddressItem[];
    createdAt?: Date;
    updatedAt?: Date;
}

/** Address book Document model type. Queries live in `./repository`. */
export type AddressBookModel = Model<AddressBookDocument>;

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
 * An entry serializes as the contract's `Address` — `_id` renamed to `id`, exactly as the product
 * snapshot embedded in an order line does.
 *
 * `./services/addresses` maps entries by hand for the wire and does not go through this, so nothing
 * in a request path changes. What does go through it is `scripts/export-demo-dataset.ts`, which publishes
 * stored rows via `toJSON()`: without this, the demo dataset would be the only place in the repo
 * where an addressable record announced itself as `_id`.
 */
applySerialization(addressItemSchema);

/**
 * Mongoose schema for persisted address books.
 *
 * `unique: true` on `userId` — one book per user is a database fact, and every mutation is a
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
 * Normalizes a serialized book: `_id` → `id`, drops `__v`. Owed to the base factory for its
 * lean reads (see `normalize` in @infrastructure/persistence/base-repository).
 */
export const applyAddressBookTransform = applySerialization(addressBookSchema);

/**
 * Model
 */
export const addressBookModel = model<AddressBookDocument, AddressBookModel>(
    'AddressBook',
    addressBookSchema
);

/**
 * @module
 * The address-book schema's contract. Shaped like the cart and the wishlist — one document per
 * user, `unique: true` on `userId`, mutated by upsert — but its lines keep an `_id`, since two
 * addresses can be identical in every typed field and still be different entries. Asserted here
 * rather than against `cartSchema` directly, since a sibling's `model.ts` is off-limits.
 */

import { addressBookSchema } from '@modules/account/model';
import {
    defaultOf,
    indexOptionSpecs,
    optionsOf,
    refOf,
    requiredPaths,
    subSchema
} from '@tests/schema';

describe('addressBookSchema', () => {
    it('requires an owner and nothing else', () => {
        expect(requiredPaths(addressBookSchema)).toEqual(['userId']);
    });

    it('makes one address book per user a database fact', () => {
        expect(indexOptionSpecs(addressBookSchema)).toContain('userId_1: unique=true');
    });

    it('starts a new book with an empty list', () => {
        expect(defaultOf(addressBookSchema, 'items')).toEqual([]);
    });

    it('points at the owner', () => {
        expect(refOf(addressBookSchema, 'userId')).toBe('User');
    });

    it('keeps timestamps', () => {
        expect(optionsOf(addressBookSchema).timestamps).toBe(true);
    });
});

describe('addressBookSchema — an entry', () => {
    it('requires a deliverable address and leaves the label and phone optional', () => {
        // The set a courier needs. `label` is the user's own word for it ("home", "work") and
        // `phone` is the courier's fallback — neither is needed to deliver.
        expect(requiredPaths(subSchema(addressBookSchema, 'items'))).toEqual([
            'city',
            'country',
            'fullName',
            'street',
            'zip'
        ]);
    });

    it('keeps an _id of its own, unlike a cart or wishlist line', () => {
        // The difference that matters, asserted against its sibling so a cleanup that "aligns" them
        // fails here: two addresses can be identical in every typed field and still be different
        // entries, so `PUT /account/addresses/:addressId` needs something to name. `true` here, vs
        // `false` on the cart's and wishlist's lines — see `cart/tests/unit/schema-contract.test.ts`.
        expect(optionsOf(subSchema(addressBookSchema, 'items'))._id).toBe(true);
    });

    it('defaults an entry to not-the-default', () => {
        // `default: false` on `default`. The first address added is promoted by the service, not
        // by the schema — a schema-level `true` would make every added address the default.
        expect(defaultOf(subSchema(addressBookSchema, 'items'), 'default')).toBe(false);
    });
});

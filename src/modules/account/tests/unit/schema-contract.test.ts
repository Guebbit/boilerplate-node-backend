/**
 * The address-book schema's contract.
 *
 * The address book is the one collection in `account` shaped like the cart and the wishlist — one
 * document per user, `unique: true` on `userId`, mutated by upsert — with one deliberate
 * difference: its lines DO keep an `_id`. That is not an oversight and not a copy-paste slip. A
 * cart line is addressed by its product and a wishlist line by its product, but two addresses can
 * be identical in every field a human types and still be different entries, so a line needs an
 * identity of its own for `PUT /account/addresses/:addressId` to name.
 *
 * Because that difference is the kind of thing a later "consistency" cleanup removes, it is stated
 * as an explicit, commented expectation rather than left implicit. It is asserted here rather than
 * against `cartSchema` directly: reaching into a sibling module's `model.ts` is exactly the import
 * the boundaries rule forbids, and the cart's own suite states the other half.
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
        // The difference that matters, asserted against its sibling so a cleanup that "aligns"
        // them fails here. Two addresses can be identical in every typed field and still be
        // different entries, so `PUT /account/addresses/:addressId` needs something to name.
        // `true` here, where the cart's and wishlist's lines are `false` — see
        // `cart/tests/unit/schema-contract.test.ts` for the matching assertion on that side.
        expect(optionsOf(subSchema(addressBookSchema, 'items'))._id).toBe(true);
    });

    it('defaults an entry to not-the-default', () => {
        // `default: false` on `default`. The first address added is promoted by the service, not
        // by the schema — a schema-level `true` would make every added address the default.
        expect(defaultOf(subSchema(addressBookSchema, 'items'), 'default')).toBe(false);
    });
});

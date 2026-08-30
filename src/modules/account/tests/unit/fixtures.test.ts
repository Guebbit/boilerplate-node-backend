/**
 * `makeAddressBook` — the address-book fixture builder.
 *
 * Unlike the cart and wishlist builders, this one gives every entry an `_id`: an address book
 * line is addressed by its own id — `PUT /account/addresses/:addressId` names it — so a fixture
 * without one seeds a book whose entries cannot be edited or deleted.
 */
import { Types } from 'mongoose';
import { makeAddressBook } from '@modules/account/fixtures';

const USER = '65dc8a99604c307b702b5ccc';
const ADDRESS = '65dcdec2b18ad5e4bd597f0f';

/** The fields a deliverable address must carry, per the schema. */
const DELIVERABLE = {
    fullName: 'Ada Lovelace',
    street: '12 Baker Street',
    city: 'London',
    zip: 'NW1',
    country: 'GB',
    default: true
};

describe('makeAddressBook', () => {
    it('stores the owner as a real ObjectId', () => {
        const book = makeAddressBook({ userId: USER });

        expect(book.userId).toBeInstanceOf(Types.ObjectId);
        expect(String(book.userId)).toBe(USER);
    });

    it('omits items when none are given', () => {
        expect(Object.hasOwn(makeAddressBook({ userId: USER }), 'items')).toBe(false);
    });

    it('gives every entry its own ObjectId, which the edit routes name', () => {
        const book = makeAddressBook({
            userId: USER,
            items: [{ id: ADDRESS, ...DELIVERABLE }]
        });

        expect(book.items![0]._id).toBeInstanceOf(Types.ObjectId);
        expect(String(book.items![0]._id)).toBe(ADDRESS);
    });

    it('passes the deliverable fields through unchanged', () => {
        const book = makeAddressBook({ userId: USER, items: [{ id: ADDRESS, ...DELIVERABLE }] });

        expect(book.items![0]).toMatchObject(DELIVERABLE);
    });

    it('omits the label and phone when they were not given', () => {
        // Both are optional on the schema. Present as `undefined` they would be stored as nothing
        // rather than left absent, which is a different document from the one intended.
        const book = makeAddressBook({ userId: USER, items: [{ id: ADDRESS, ...DELIVERABLE }] });

        expect(Object.hasOwn(book.items![0], 'label')).toBe(false);
        expect(Object.hasOwn(book.items![0], 'phone')).toBe(false);
    });

    it('keeps the label and phone when they are', () => {
        const book = makeAddressBook({
            userId: USER,
            items: [{ id: ADDRESS, ...DELIVERABLE, label: 'home', phone: '+44 20 7946 0000' }]
        });

        expect(book.items![0].label).toBe('home');
        expect(book.items![0].phone).toBe('+44 20 7946 0000');
    });
});

/**
 * @module
 * The address book's one knob: how many entries a book may hold.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Address-book size. */
export const addressesConfig = defineConfig({
    name: 'addresses',
    shape: {
        NODE_ADDRESS_BOOK_MAX: int({
            default: 20,
            min: 1,
            describe:
                'Entries one account’s address book may hold. A book is one document, so an unbounded one grows toward the 16 MB document limit and breaks that account’s own writes.'
        })
    }
});

/**
 * The most entries one address book may hold. 20 is generous for a person (a home, a few offices,
 * relatives); the cap exists because a book is ONE document, and entries are PII-encrypted, so
 * stored ones are larger than the input.
 * @returns the cap on entries per book
 */
export const addressBookMax = (): number => addressesConfig().NODE_ADDRESS_BOOK_MAX;

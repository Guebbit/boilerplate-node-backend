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
        NODE_ADDRESS_BOOK_MAX: int({ default: 20, min: 1 })
    }
});

/**
 * The most entries one address book may hold. 20 is generous for a person (a home, a few offices,
 * relatives); the cap exists because a book is ONE document, and entries are PII-encrypted, so
 * stored ones are larger than the input.
 * @returns the cap on entries per book
 */
export const addressBookMax = (): number => addressesConfig().NODE_ADDRESS_BOOK_MAX;

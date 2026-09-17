/**
 * @module
 * `deriveSourceDigest` — the pure half of the translation write path. Everything that touches the
 * `locales`/`translations` collections or the registry is driven through Mongo instead, in
 * `../integration/translations.test.ts`.
 */

import { deriveSourceDigest } from '../../repository';

describe('deriveSourceDigest', () => {
    it('is the same digest whatever order the keys arrive in', () => {
        const inOrder = deriveSourceDigest({ title: 'Cuccia', description: 'Comoda' });
        const reversed = deriveSourceDigest({ description: 'Comoda', title: 'Cuccia' });

        expect(inOrder).toBe(reversed);
    });

    it('changes when a value changes', () => {
        const original = deriveSourceDigest({ title: 'Cuccia' });
        const edited = deriveSourceDigest({ title: 'Cuccia grande' });

        expect(original).not.toBe(edited);
    });

    it('changes when a key is added, even with the same values otherwise', () => {
        const withoutDescription = deriveSourceDigest({ title: 'Cuccia' });
        const withDescription = deriveSourceDigest({ title: 'Cuccia', description: '' });

        expect(withoutDescription).not.toBe(withDescription);
    });

    it('is the same digest for two calls with identical content', () => {
        const fields = { title: 'Cuccia', description: 'Comoda' };

        expect(deriveSourceDigest(fields)).toBe(deriveSourceDigest({ ...fields }));
    });
});

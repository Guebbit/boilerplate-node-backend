/**
 * @module
 * The registry edit: three lists in `src/modules.ts`, each kept alphabetical, with the terminators
 * of the last line (a bare identifier, a semicolon) surviving an insert at either end.
 */

import { deriveNames } from '../../../../scripts/scaffold/names';
import { isRegistered, registerModule } from '../../../../scripts/scaffold/registry';

/** A registry with the same three lists as the real one, and a function after the array. */
const REGISTRY = `import type { AppModule } from '@kernel/registry';
import cart from './modules/cart/module';
import feedback from './modules/feedback/module';
import wishlist from './modules/wishlist/module';

export const enabledModules: AppModule[] = [
    cart,
    feedback,
    wishlist
];

export const enabledModuleLocales = (): string[] =>
    enabledModules
        .map((appModule) => appModule.locales);

export type ModuleName =
    | 'cart'
    | 'feedback'
    | 'wishlist';
`;

describe('registerModule', () => {
    it('inserts in the middle of every list', () => {
        const edited = registerModule(REGISTRY, deriveNames('field-notes'));

        expect(edited).toContain(
            "import feedback from './modules/feedback/module';\nimport fieldNotes from './modules/field-notes/module';\nimport wishlist"
        );
        expect(edited).toContain('    feedback,\n    fieldNotes,\n    wishlist\n];');
        expect(edited).toContain("    | 'feedback'\n    | 'field-notes'\n    | 'wishlist';");
    });

    it('moves the terminators when the new entry sorts last', () => {
        const edited = registerModule(REGISTRY, deriveNames('zebras'));

        expect(edited).toContain('    wishlist,\n    zebras\n];');
        expect(edited).toContain("    | 'wishlist'\n    | 'zebras';");
        // The function after the array is not part of it.
        expect(edited).toContain('    enabledModules\n        .map');
    });

    it('sorts the array by identifier and the imports by folder', () => {
        // api-keys imports before cart by folder name; its identifier apiKeys sorts before cart too.
        const edited = registerModule(REGISTRY, deriveNames('api-keys'));

        expect(edited.indexOf('modules/api-keys/module')).toBeLessThan(
            edited.indexOf('modules/cart/module')
        );
        expect(edited).toContain('[\n    apiKeys,\n    cart,');
    });

    it('refuses a file that has no ModuleName union', () => {
        expect(() =>
            registerModule(REGISTRY.replace('export type ModuleName', 'type X'), deriveNames('a'))
        ).toThrow(/ModuleName/);
    });
});

describe('isRegistered', () => {
    it('reads the import lines', () => {
        expect(isRegistered(REGISTRY, 'feedback')).toBe(true);
        expect(isRegistered(REGISTRY, 'field-notes')).toBe(false);
    });
});

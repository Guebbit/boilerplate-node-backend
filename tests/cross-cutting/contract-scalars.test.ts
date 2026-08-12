/**
 * `infrastructure`'s shared scalars still match every operation in the contract.
 *
 * `PageSize` and `hardDelete` are single shared components in `openapi.yaml`, but orval flattens a
 * shared component into one constant PER OPERATION — forty identical numbers, each named after the
 * endpoint it was emitted for. `infrastructure/http/schemas.ts` cannot import "the" constant because there
 * isn't one; importing any single operation's constant puts a domain's name in `infrastructure` and makes
 * that domain undeletable once the contract is split per module.
 *
 * So `infrastructure` declares the bounds and this test carries the guarantee the import used to: raise
 * `maximum` in `openapi.yaml`, regenerate, and every constant moves while `infrastructure` does not — which
 * fails here rather than silently answering 422 for a page size the contract calls legal.
 *
 * It sweeps the GENERATED module rather than a list, so a new endpoint is covered by existing.
 */

import * as generated from '@api/schemas.zod';
import { pageSizeSchema, hardDeleteSchema } from '@infrastructure/http/schemas';

/** Every generated constant whose name ends in the given suffix. */
const constantsEndingIn = (suffix: string): [name: string, value: unknown][] =>
    Object.entries(generated as Record<string, unknown>).filter(([name]) => name.endsWith(suffix));

describe('contract scalars', () => {
    it('finds the generated constants it means to compare against', () => {
        // A canary: if orval's naming changes, an empty sweep would pass over nothing.
        expect(constantsEndingIn('PageSizeMax').length).toBeGreaterThan(5);
        expect(constantsEndingIn('HardDeleteDefault').length).toBeGreaterThan(2);
    });

    it('agrees with every operation on the maximum page size', () => {
        const disagreeing = constantsEndingIn('PageSizeMax')
            // The largest value core accepts is the bound it was built with.
            .filter(([, value]) => pageSizeSchema.safeParse(value).success === false)
            .map(([name, value]) => `${name} = ${String(value)}`);

        expect(disagreeing).toEqual([]);
    });

    it('rejects one above every operation’s maximum', () => {
        // The other half: core must not accept MORE than the contract allows either, or a
        // lowered `maximum` would pass unnoticed.
        const tooPermissive = constantsEndingIn('PageSizeMax')
            .filter(([, value]) => pageSizeSchema.safeParse((value as number) + 1).success === true)
            .map(([name]) => name);

        expect(tooPermissive).toEqual([]);
    });

    it('agrees with every operation on the hard-delete default', () => {
        const parsed = hardDeleteSchema.parse(undefined);
        const disagreeing = constantsEndingIn('HardDeleteDefault')
            .filter(([, value]) => value !== parsed)
            .map(([name, value]) => `${name} = ${String(value)}`);

        expect(disagreeing).toEqual([]);
    });
});

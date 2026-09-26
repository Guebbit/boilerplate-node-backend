/**
 * Ambient re-export for `@typescript-eslint/parser`, whose types this file's own package
 * resolves fine (`npx tsc --traceResolution` succeeds), but ts-jest's language service cannot
 * under `module`/`moduleResolution: node16` — reproduced in total isolation (a one-line test file
 * with only this import fails identically), so it's ts-jest's resolver, not this package or this
 * repo's tsconfig. Re-exporting through a relative path sidesteps the broken bare-specifier
 * lookup entirely; Node's own `require` at runtime was never affected; only this file's own static
 * type-check was. See `AUDIT_0924_2_LEFTOVERS.md`'s ts-jest/node16 entry for the same bug class
 * against a different package — reworking that resolution strategy is the real fix, out of scope
 * here.
 */
declare module '@typescript-eslint/parser' {
    export * from '../../../../node_modules/@typescript-eslint/parser/dist/index';
    export { default } from '../../../../node_modules/@typescript-eslint/parser/dist/index';
}

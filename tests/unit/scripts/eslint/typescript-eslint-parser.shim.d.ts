/**
 * Ambient re-export for `@typescript-eslint/parser`, working around ts-jest's `node16`
 * resolver — full reasoning and the `ts-jest` pin it shares with `@casl/ability`:
 * `docs/reference/tests.md#why-ts-jest-stays-pinned-at-29-4-9`.
 */
declare module '@typescript-eslint/parser' {
    export * from '../../../../node_modules/@typescript-eslint/parser/dist/index';
    export { default } from '../../../../node_modules/@typescript-eslint/parser/dist/index';
}

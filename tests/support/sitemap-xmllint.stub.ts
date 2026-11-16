/**
 * `sitemap`'s `lib/xmllint.js`, replaced for the whole suite by `moduleNameMapper`.
 *
 * `sitemap` 10 ships ES modules only, and this file is the one that reads `import.meta.dirname`
 * (to find its bundled XSD): babel-jest compiles the module syntax to CommonJS, where
 * `import.meta` does not exist, so the whole package would fail to PARSE. Nothing here calls
 * `xmlLint`, which shells out to the `xmllint` binary; the real file still loads in production,
 * where Node runs `sitemap` as the ES module it is.
 *
 * @see docs/modules/sitemap.md#libraries
 */

/**
 * Rejects rather than resolving: a test that means to validate must say so with its own mock. (The
 * real one rejects with `[error]`; nothing here reads that shape.)
 *
 * @returns a promise that always rejects
 */
export const xmlLint = (): Promise<void> =>
    Promise.reject(
        new Error('xmlLint is stubbed in tests; see tests/support/sitemap-xmllint.stub.ts')
    );

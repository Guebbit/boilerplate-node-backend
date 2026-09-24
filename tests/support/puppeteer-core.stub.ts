/**
 * `puppeteer-core`, replaced for the whole suite by `moduleNameMapper`.
 *
 * v25 dropped the CommonJS build and ships `type: module`, so the real package cannot be parsed
 * under this CJS jest setup — and any suite reaching `adapters/pdf.ts` transitively, through a
 * route table, would fail to PARSE rather than fail an assertion. Nothing ever wanted the real
 * one: CI installs no Chromium, and the suites that exercise the adapter mock it themselves.
 *
 * See: docs/tools/unit-testing.md
 */

/**
 * Throws rather than resolving a fake browser: a test that genuinely means to render must say so
 * with its own `jest.mock`, the way `tests/unit/infrastructure/adapters/pdf.test.ts` does. A silent
 * no-op here would let such a test pass while asserting nothing.
 */
const launch = (): never => {
    throw new Error(
        'puppeteer-core is stubbed in tests. Mock it in the suite that needs it — see tests/support/puppeteer-core.stub.ts'
    );
};

export default { launch };

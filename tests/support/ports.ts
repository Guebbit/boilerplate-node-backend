/**
 * Observing an observability port from a test.
 *
 * Why not `jest.spyOn`: `emitAuditEvent` and `emitAnalyticsEvent` are called through a namespace
 *   (`import * as auditPort`), so `jest.spyOn(auditPort, 'emitAuditEvent')` looks natural. It is not
 *   portable: a CommonJS namespace exposes each export as a NON-CONFIGURABLE getter (`__importStar`
 *   under ts-jest, `@swc/jest` under `jest.config.mutation.js`), and `spyOn` must `defineProperty`
 *   over it. Under swc and in Stryker's sandbox it throws `TypeError: Cannot redefine property:
 *   emitAuditEvent` before the first assertion.
 * The fix:   replace the MODULE, so every consumer resolves a plain `jest.fn()`. The `account` unit
 *   suites wrote it in prose first; the replacement is declared per test file (`jest.mock` is
 *   hoisted per module registry) and this helper is the other half.
 * Preserved: a `spyOn` inside an `it()` records FROM THAT LINE, so earlier emits are invisible. A
 *   module-level `jest.fn()` records from file load, which breaks the `not.toHaveBeenCalledWith`
 *   assertions that make an "and not the other event" case worth having. Clearing on hand-out
 *   restores the spy's semantics, so call sites keep reading
 *   `const auditSpy = observePort(auditPort.emitAuditEvent)` where the `spyOn` stood.
 */

/**
 * Hand out a mocked port function, recording from this line onwards.
 *
 * @param port - the function off a `jest.mock`-replaced module
 * @returns the same function typed as a mock, with its call history cleared
 * @throws {Error} when the port is a real function, not a mock: the test file must declare the module replacement itself
 */
export const observePort = <T extends (...args: never[]) => unknown>(
    port: T
): jest.MockedFunction<T> => {
    const mocked = port as jest.MockedFunction<T>;

    if (typeof mocked.mockClear !== 'function')
        throw new Error(
            'observePort received a real function, not a mock. The test file must declare the ' +
                "module replacement itself — jest.mock('@infrastructure/observability/audit', " +
                '...) — because jest.mock is hoisted per module registry and cannot be applied ' +
                'from a helper. See the header of tests/support/ports.ts.'
        );

    mocked.mockClear();
    return mocked;
};

/**
 * The module replacement for `@infrastructure/observability/audit`: every real export, with
 * `emitAuditEvent` a plain `jest.fn()` and `recordAudit` routed through it.
 *
 * `recordAudit` closes over its own module's real `emitAuditEvent`, immune to the override, so it
 * is rebuilt here to reach the replacement — a spy on `emitAuditEvent` then sees every
 * `recordAudit` call, as it saw every direct one. A `recordAudit` with no context records nothing,
 * like the real one.
 *
 * Declared per test file, because `jest.mock` is hoisted per module registry:
 *
 *     jest.mock('@infrastructure/observability/audit', () =>
 *         jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
 *     );
 *
 * @returns the replacement module
 */
export const auditPortMock = () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
};

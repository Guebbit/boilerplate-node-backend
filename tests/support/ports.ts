/**
 * Observing an observability port from a test.
 *
 * ── WHY THIS EXISTS RATHER THAN `jest.spyOn` ────────────────────────────────────────────────────
 * `emitAuditEvent` and `emitAnalyticsEvent` are consumed as `import * as auditPort` and called
 * through the namespace, so the obvious `jest.spyOn(auditPort, 'emitAuditEvent')` reads as the
 * natural thing to write. It is not portable: a CommonJS namespace object exposes each export as a
 * NON-CONFIGURABLE getter — `__importStar` does it under ts-jest, and `@swc/jest` does it under
 * `jest.config.mutation.js` — and `spyOn` has to `defineProperty` over the name it replaces. Under
 * the default transform the two happen to agree often enough that the pattern looks fine; under
 * swc, and inside Stryker's instrumented sandbox, it throws
 * `TypeError: Cannot redefine property: emitAuditEvent` before the first assertion runs.
 *
 * The `account` unit suites hit this first and wrote the fix out in prose: replace the MODULE, so every consumer resolves a plain, always-configurable
 * `jest.fn()`, instead of trying to redefine a getter. This is that fix, factored out — the module
 * replacement is declared per test file (it must be, `jest.mock` is hoisted per module registry),
 * and this helper covers the other half.
 *
 * ── WHAT IT PRESERVES ───────────────────────────────────────────────────────────────────────────
 * A `jest.spyOn` inside an `it()` starts recording AT THAT LINE — anything the same test emitted
 * beforehand is invisible to it. A module-level `jest.fn()` records from the moment the file
 * loaded, which quietly breaks exactly the `not.toHaveBeenCalledWith` assertions that make an
 * "and not the other event" case worth having. Clearing on hand-out restores the spy's semantics,
 * so call sites keep reading `const auditSpy = observePort(auditPort.emitAuditEvent)` in the same
 * place the `spyOn` stood.
 */

/**
 * Hand out a mocked port function, recording from this line onwards.
 *
 * @param port - the function off a `jest.mock`-replaced module
 * @returns the same function typed as a mock, with its call history cleared
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

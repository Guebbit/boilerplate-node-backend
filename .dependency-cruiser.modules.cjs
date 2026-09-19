/*
 * The one rule `.dependency-cruiser.cjs` cannot state: a cycle between two MODULES, not between
 * two files. That file's own `module-coupling-<name>` rules already refuse an undeclared FILE
 * import; they say nothing about two modules each legitimately importing the other through their
 * own published barrels, which is exactly the shape `account ↔ cart` would take if the address
 * book were still inside `account` instead of its own `addresses` module — every file-level rule
 * would pass, and the cycle would only be visible one folder up.
 *
 * Its own cruise, not folded into the main config's `forbidden` list, for one reason:
 * `scope: 'folder'` rules cannot filter which PATH a cycle runs through, and cruising `src tests`
 * together reports dozens of false cycles purely through test-support folders that import several
 * modules' `tests/factories.ts` back and forth. Run over `src/modules` alone, with `tests/`
 * excluded below, the graph has nothing left to report falsely.
 *
 * Wired into `check:dependencies` alongside the main config, so `complete` and the pre-commit hook
 * pick it up with no new gate name to remember.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'no-module-cycles',
            comment:
                'Two modules importing each other, however many files and however many hops it ' +
                'takes to close the loop. A sibling that has to reach back belongs on the domain ' +
                'event bus instead (`kernel/events.ts`) — see any module already listening for ' +
                'USER_DELETED for the shape.',
            severity: 'error',
            scope: 'folder',
            from: { path: '^src/modules/[^/]+$' },
            to: { circular: true }
        }
    ],
    options: {
        // Same reasoning as the main config: the RUNTIME graph only, so a cycle closed purely by
        // an `import type` (erased at compile time, and already refused by
        // `no-restricted-imports` for the tiers that matter) does not report here either.
        tsConfig: { fileName: 'tsconfig.json' },
        doNotFollow: { path: 'node_modules' },
        exclude: {
            // `tests/` per module: see the module docblock above on why together with `src`.
            path: String.raw`(^|/)(tests|\.stryker-tmp|\.tmp|\.dev|\.prism|dist|coverage|reports)/`
        },
        reporterOptions: {
            text: { highlightFocused: true }
        }
    }
};

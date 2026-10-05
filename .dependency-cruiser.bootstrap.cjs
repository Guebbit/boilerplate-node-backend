/*
 * The clean-checkout bootstrap guard — `npm run check:dependencies`.
 *
 * `postinstall` runs `contracts:bundle` BEFORE `gen:api` and `gen:asyncapi`. On a clean checkout
 * `api/` and `src/types/asyncapi.generated.ts` do not exist yet, so the bundler dies with
 * "Cannot find module '@api/error-codes'" if its STATIC import graph reaches either. Locally
 * nobody sees it: every checkout already has `api/` from an earlier run.
 *
 * Only `api/permission-actions.ts` may be reached (`gen:permission-actions` runs first, on purpose).
 *
 * Its own cruise, because the rule must ignore dynamic `import()`: that is how the client
 * collections stay opt-in (`scripts/contracts/bundle-registry.ts`). A `reachable` rule cannot
 * filter edge types, but `doNotFollow` below can.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'contracts-bundler-loads-no-generated-code',
            comment:
                'The bundler runs before the generated code exists. Load whatever needs it with a dynamic import() so a bare bundle run never touches it.',
            severity: 'error',
            from: { path: String.raw`^scripts/contracts/build-bundles\.ts$` },
            to: {
                path: String.raw`^api/(?!permission-actions\.ts$)|^src/types/asyncapi\.generated\.ts$`,
                reachable: true
            }
        }
    ],
    options: {
        tsConfig: { fileName: 'tsconfig.json' },
        // Dynamic imports are recorded but not traversed — see the header.
        doNotFollow: { path: 'node_modules', dependencyTypes: ['dynamic-import'] },
        exclude: { path: String.raw`^(tmp|\.dev|\.prism|dist)/` },
        reporterOptions: { text: { highlightFocused: true } }
    }
};

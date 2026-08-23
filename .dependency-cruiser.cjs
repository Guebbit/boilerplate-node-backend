/*
 * The graph rules — `npm run check:dependencies`.
 *
 * `eslint.config.ts` already states the tier walls through `eslint-plugin-boundaries`, and that is
 * where a wall belongs: it reports in the editor, at the offending import, while the code is being
 * written. This file exists for the two questions a linter structurally cannot answer, because
 * ESLint sees one file's own imports and nothing further:
 *
 *   1. **Reachability.** "The domain layer may not import mongoose" is a lint rule. "The domain
 *      layer may not REACH mongoose" — through its own helper, through a shared type file, through
 *      anything at all — is a question about the whole graph. A tier stays pure by accident until
 *      something checks the transitive form, and the direct form is the one refactors route around:
 *      nobody adds `import mongoose` to a domain file, they add a helper that already had it.
 *
 *   2. **Cycles.** A → B → A compiles, lints and runs, and fails only in whichever order the
 *      module system happens to initialise it — as a `undefined is not a function` at boot, far
 *      from either file. No per-file rule can see a cycle, because no file in one is doing
 *      anything wrong on its own.
 *
 * Deliberately NOT restated here: the tier walls themselves. Two tools enforcing one property is
 * one tool too many — they drift, and the second failure is always the confusing one. Anything
 * expressible as "this file may not import that file" belongs in `eslint.config.ts`.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: 'no-circular',
            comment:
                'A cycle resolves to whatever the module system initialises first, so the symptom is an undefined export at boot rather than an error at either file. Break it by moving the shared piece down a tier, or by letting the two talk through a domain event — see kernel/events.ts.',
            severity: 'error',
            from: {},
            /*
             * `type-only` edges are excluded, and the exclusion is the whole reason this rule is
             * trustworthy. `tsPreCompilationDeps` below reports the TYPE graph as well as the
             * runtime one, and a type-only cycle is not a cycle: `import type` is erased, so
             * `cache.ts ⇄ dependency-health.ts` — which reads as four violations — has no edge at
             * all once the TypeScript is compiled. Left in, this rule would report eight problems
             * that cannot be fixed and cannot happen, which is how a gate gets switched off.
             */
            to: { circular: true }
        },

        {
            name: 'domain-cannot-reach-persistence',
            comment:
                'The domain layer may not know how anything is stored, and that has to hold through every hop: a domain file importing a helper that imports mongoose knows about storage just as surely as if it had imported it itself. Take the data as a plain argument and let the repository do the reading.',
            severity: 'error',
            from: { path: '^src/modules/[^/]+/domain/' },
            to: { path: 'node_modules/(mongoose|mongodb)', reachable: true }
        },

        {
            name: 'domain-cannot-reach-http',
            comment:
                'The domain layer may not know it is being called over HTTP, transitively included. Return a verdict; the controller turns it into a status code.',
            severity: 'error',
            from: { path: '^src/modules/[^/]+/domain/' },
            to: { path: 'node_modules/(express|supertest)', reachable: true }
        },

        {
            name: 'infrastructure-cannot-reach-domains',
            comment:
                'infrastructure is the bottom of the graph. ESLint refuses the direct import; this refuses the path through two hops, which is how the inversion actually arrives — a shared helper that grew a domain import, not a tier reaching up on purpose.',
            severity: 'error',
            from: { path: '^src/infrastructure/' },
            to: { path: '^src/(modules|app)/', reachable: true }
        },

        {
            name: 'not-to-dev-dep',
            comment:
                'Production code reaching a devDependency runs fine here and crashes on a deployment installed with --omit=dev. The failure is at require time, on the server, with no local reproduction.',
            severity: 'error',
            from: { path: '^src/', pathNot: '^src/modules/[^/]+/tests/' },
            to: { dependencyTypes: ['npm-dev'] }
        },

        {
            name: 'no-deprecated-core',
            comment:
                'A deprecated Node core module keeps working until the major that removes it, at which point the upgrade fails at runtime rather than at install.',
            severity: 'error',
            from: {},
            to: {
                dependencyTypes: ['core'],
                path: String.raw`^(punycode|domain|sys|util\.promisify)$`
            }
        }
    ],

    options: {
        /*
         * The aliases (`@modules`, `@kernel`, `@infrastructure`, `@app`, `@types`) live in
         * `tsconfig.json`, and without reading it every one of them is an unresolvable
         * specifier — the graph would be a set of disconnected files and every rule above
         * would pass over nothing.
         */
        tsConfig: { fileName: 'tsconfig.json' },

        /*
         * The RUNTIME graph, deliberately — `tsPreCompilationDeps` is left off.
         *
         * Turned on, the graph also carries `import type` edges, and every rule here then reports
         * on a graph that does not exist after compilation. It showed up immediately: eight
         * "cycles" across `cache.ts`, `queue.ts`, `dependency-health.ts` and `payments/fake.ts`,
         * every one of them closed by an `import type` that TypeScript erases. None can produce
         * the boot-order failure the cycle rule is for, and none can be fixed except by deleting
         * a type import that is doing its job.
         *
         * Nothing is lost by leaving it off. A direct `import mongoose` from the domain layer —
         * type-only or not — is already refused by `no-restricted-imports` in `eslint.config.ts`;
         * what this file adds is the path through two hops, and a path made of erased edges is not
         * a path anything can take at runtime.
         */

        /*
         * `node_modules` is recorded but not cruised into. The rules above need the EDGE into
         * mongoose to exist; they do not need mongoose's own 400 files, and following them turns
         * a two-second run into a minute.
         */
        doNotFollow: { path: 'node_modules' },

        /*
         * `node_modules` is deliberately NOT excluded, only left unfollowed above. Excluding it
         * drops those modules from the graph, and a rule whose `to` names one then matches
         * nothing — the reachability rules read as passing while checking an empty set.
         */
        exclude: {
            path: String.raw`(^|/)(\.stryker-tmp|\.tmp|\.dev|\.prism|dist|coverage|reports)/`
        },

        reporterOptions: {
            text: { highlightFocused: true }
        }
    }
};

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
 *   3. **Edges ESLint's element model does not reach.** `eslint-plugin-boundaries` refuses a
 *      MODULE reaching a sibling's internals, and stops there: `src/app/` reaching
 *      `@modules/account/session/jwt` is allowed by every rule in `eslint.config.ts` (verified by
 *      probe). It is also allowed to reach any sibling it likes. Both are graph facts about which
 *      folder may name which folder, so they live here rather than as a hand-written sweep.
 *
 * Deliberately NOT restated here: the tier walls themselves. Two tools enforcing one property is
 * one tool too many — they drift, and the second failure is always the confusing one. Anything
 * expressible as "this file may not import that file" AND already covered by
 * `eslint-plugin-boundaries` belongs in `eslint.config.ts`.
 *
 * ── `required` rules, considered and declined ─────────────────────────────────────────────────
 * dependency-cruiser also supports `required` — the inverse of `forbidden`: every file matching X
 * MUST depend on something matching Y ("every controller imports the response envelope", "every
 * model imports the shared transform"). It is a real feature and it is not used here on purpose.
 * Every candidate rule turned out to be a shape a reader can see in one file, enforced by a tool
 * that has to load the whole graph to say so — and the failure it prevents is one the first
 * request or the first test already reports. See `OVERENGINEERED.md` for the standard this repo
 * holds guards to. Reach for it if a REQUIRED edge ever becomes invisible at the call site; do not
 * reach for it to make a convention feel official.
 */

/**
 * Which siblings each module may reach, and nothing else may.
 *
 * This is the enforceable half of what a `dependsOn` field on each manifest used to declare: the
 * field was read by nothing at runtime and reconciled against the imports by a 217-line test, so
 * it went (`OVERENGINEERED.md` §1, §5). What it genuinely bought — a new cross-module coupling
 * being a deliberate edit rather than a one-line import nobody questions — is bought here instead,
 * in one place, reported at the offending import.
 *
 * WHY the docblock still matters: this map holds the PAIR. What is reached across an edge, and why
 * it is that kind of relationship, is prose at the top of each `module.ts` — beside the imports it
 * describes, where a reader meets both at once, and where a coupling the import graph cannot see
 * (a shared document, a metric read by string, a migration touching another domain's collection)
 * can also be written down. A rule reconciled against imports could never hold one of those.
 */
const MODULE_EDGES = {
    account: ['users'],
    cart: ['account', 'delivery', 'inventory', 'orders', 'products', 'users'],
    delivery: ['orders', 'users'],
    inventory: ['products'],
    observability: ['audit-logs'],
    orders: ['inventory', 'products'],
    payments: ['inventory', 'orders', 'users'],
    wishlist: ['cart', 'products', 'users']
};

/** Every module folder, so a module reaching a sibling it does not declare is refused by name. */
const MODULE_NAMES = [
    'account',
    'audit-logs',
    'cart',
    'delivery',
    'feedback',
    'inventory',
    'locales',
    'observability',
    'orders',
    'payments',
    'products',
    'users',
    'wishlist'
];

/** One rule per module: it may reach itself and the siblings named above, and no others. */
const moduleCouplingRules = MODULE_NAMES.map((name) => {
    const reaches = MODULE_EDGES[name] ?? [];
    return {
        name: `module-coupling-${name}`,
        comment: `${name} may reach ${reaches.join(', ') || 'no sibling'}. A new one is a new coupling: add it to MODULE_EDGES and say in this module's docblock what it reaches for — or find a way not to need it. A sibling that has to reach back belongs on the event bus (kernel/events.ts), not in this list.`,
        severity: 'error',
        from: { path: `^src/modules/${name}/`, pathNot: `^src/modules/${name}/tests/` },
        to: {
            path: '^src/modules/[^/]+/',
            pathNot: `^src/modules/(${[name, ...reaches].join('|')})/`
        }
    };
});

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
            name: 'module-internals-are-private',
            comment:
                'A module has two public paths — `@modules/<name>` and `@modules/<name>/demo` — and the moment anything reaches past them the module stops being deletable. `eslint-plugin-boundaries` states this for one module reaching another and cannot state it for the tiers that are not modules: `src/app/` reaching `@modules/account/session/jwt` passes every lint rule. This is that gap, for all thirteen at once.',
            severity: 'error',
            from: { path: '^src/', pathNot: '^src/modules/[^/]+/' },
            to: { path: String.raw`^src/modules/[^/]+/(?!index\.ts|module\.ts|demo\.ts)` }
        },

        {
            name: 'unit-layer-stays-database-free',
            comment:
                'Stryker reruns the unit suite once per mutant, so a `beforeEach` wipe that is microseconds in `npm test` is paid thousands of times over. A spec that needs a database belongs in `tests/integration/`. Stated as REACHABILITY rather than as a forbidden import, because that is how it actually arrives: not a spec importing `mongodb-memory-server`, but a spec importing a helper that already had it.',
            severity: 'error',
            from: { path: '(^tests/unit/|^src/modules/[^/]+/tests/unit/)' },
            to: { path: '(mongodb-memory-server|^tests/support/database)', reachable: true }
        },

        ...moduleCouplingRules,

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

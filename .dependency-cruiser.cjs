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
 * request or the first test already reports. The standard a guard here has to meet: it catches
 * something no reader and no test would. Reach for it if a REQUIRED edge ever becomes invisible at
 * the call site; do not reach for it to make a convention feel official.
 */

const fs = require('node:fs');
const path = require('node:path');
const { parse: parseYaml } = require('yaml');

/**
 * Which siblings each module may reach, and nothing else may.
 *
 * The enforceable half of each module's own `module.yaml#dependsOn`: declaring one there buys
 * nothing at runtime by itself and costs a reconciliation test to keep honest. What it genuinely
 * buys — a new cross-module coupling being a deliberate edit rather than a one-line import nobody
 * questions — is bought here instead, read off every module's own file and enforced in one place,
 * reported at the offending import.
 *
 * WHY `module.ts`'s docblock still matters: `module.yaml` holds the EDGE only. What is reached
 * across it, and why it is that kind of relationship, is prose at the top of each `module.ts` —
 * beside the imports it describes, where a reader meets both at once, and where a coupling the
 * import graph cannot see (a shared document, a metric read by string, a TTL window another domain
 * depends on) can also be written down. A rule reconciled against imports could never hold one of
 * those, and `module.yaml` is deliberately just the allow-list, not the reasoning.
 *
 * Fails closed on purpose: a module folder with no `module.yaml` gets `[]` — it may reach no
 * sibling, never "no rule at all" — and a `dependsOn` that is not an array of strings throws,
 * naming the offending file, rather than silently permitting everything.
 */
const MODULES_ROOT = path.join(__dirname, 'src', 'modules');

/** Every module folder — read from disk, so a new module needs no edit here to be covered. */
const MODULE_NAMES = fs
    .readdirSync(MODULES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

/** `{ moduleName: dependsOn[] }`, read from each module's own `module.yaml`. */
const MODULE_EDGES = Object.fromEntries(
    MODULE_NAMES.map((name) => {
        const descriptorPath = path.join(MODULES_ROOT, name, 'module.yaml');
        if (!fs.existsSync(descriptorPath)) return [name, []];

        const descriptor = parseYaml(fs.readFileSync(descriptorPath, 'utf8'));
        const dependsOn = descriptor?.dependsOn;
        if (!Array.isArray(dependsOn) || dependsOn.some((entry) => typeof entry !== 'string'))
            throw new Error(`${descriptorPath}: "dependsOn" must be an array of module names`);

        return [name, dependsOn];
    })
);

/** One rule per module: it may reach itself and the siblings named above, and no others. */
const moduleCouplingRules = MODULE_NAMES.map((name) => {
    const reaches = MODULE_EDGES[name] ?? [];
    return {
        name: `module-coupling-${name}`,
        comment: `${name} may reach ${reaches.join(', ') || 'no sibling'}. A new one is a new coupling: add it to src/modules/${name}/module.yaml and say in this module's docblock what it reaches for — or find a way not to need it. A sibling that has to reach back belongs on the event bus (kernel/events.ts), not in this list.`,
        severity: 'error',
        from: { path: `^src/modules/${name}/`, pathNot: `^src/modules/${name}/tests/` },
        to: {
            path: '^src/modules/[^/]+/',
            pathNot: `^src/modules/(${[name, ...reaches].join('|')})/`
        }
    };
});

/**
 * `{ moduleName: 'foundation' | 'shop' | 'example' }`, read from each module's own `module.yaml#group` —
 * Fails closed the same way `MODULE_EDGES` does: a module folder with no descriptor, or
 * whose `group` is missing or spelled wrong, throws naming the offending file rather than quietly
 * leaving the line unenforced for it.
 */
const MODULE_GROUP = Object.fromEntries(
    MODULE_NAMES.map((name) => {
        const descriptorPath = path.join(MODULES_ROOT, name, 'module.yaml');
        if (!fs.existsSync(descriptorPath))
            throw new Error(`${descriptorPath}: missing — every module needs a group`);

        const group = parseYaml(fs.readFileSync(descriptorPath, 'utf8'))?.group;
        if (group !== 'foundation' && group !== 'shop' && group !== 'example')
            throw new Error(`${descriptorPath}: "group" must be "foundation", "shop" or "example"`);

        return [name, group];
    })
);

/** Every module in each group, read off `MODULE_GROUP` rather than hand-listed, so relabelling a module in its own `module.yaml` is the only edit this rule ever needs. */
const FOUNDATION_MODULES = MODULE_NAMES.filter((name) => MODULE_GROUP[name] === 'foundation');
const SHOP_MODULES = MODULE_NAMES.filter((name) => MODULE_GROUP[name] === 'shop');
const EXAMPLE_MODULES = MODULE_NAMES.filter((name) => MODULE_GROUP[name] === 'example');

/** Every module that carries a `domain/` folder — read from disk, so a new one needs no edit here. */
const DOMAIN_MODULES = MODULE_NAMES.filter((name) =>
    fs.existsSync(path.join(MODULES_ROOT, name, 'domain'))
);

/**
 * `domain/` as an ALLOW-list, not a deny-list.
 *
 * The two rules this replaces (`domain-cannot-reach-persistence`, `domain-cannot-reach-http`)
 * only named `mongoose`/`mongodb` and `express`/`supertest` — `redis`, `amqplib`, `node:fs`, or
 * any other framework or IO dependency would have passed uncaught, defeating the point of a
 * "pure domain logic" boundary. One rule per module instead, stating what `domain/` MAY reach:
 * its own module's domain siblings (so `tax.ts` can still import `money.ts`), and `@types` — the
 * only two things any `domain/` file in this repo actually imports today. A genuinely new, pure
 * utility a future domain file needs is a line added here, deliberately, rather than a dependency
 * that arrives silently because nothing was checking.
 */
const domainPurityRules = DOMAIN_MODULES.map((name) => ({
    name: `domain-purity-${name}`,
    comment: `${name}/domain/ may reach its own domain siblings and @types, nothing else — no framework, no database driver, no queue client, no filesystem. Add the specific pure package here if a domain rule genuinely needs one; don't widen this to a deny-list again.`,
    severity: 'error',
    from: { path: `^src/modules/${name}/domain/` },
    to: { pathNot: `^src/modules/${name}/domain/|^src/types` }
}));

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

        ...domainPurityRules,

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
            name: 'no-non-package-json',
            comment:
                "An import that resolves only because some OTHER dependency happens to pull the same package in too — `npm-no-pkg` (no package.json dependency-cruiser can trace back to any declared one) or `npm-unknown` (resolves under node_modules, but package.json's own dependencies/devDependencies never named it). It works today and stops the moment that other tree reshapes. Scoped to src|scenarios|scripts, the same three trees `generate-dependency-map.ts` scans for the same reason.",
            severity: 'error',
            from: { path: '^(src|scenarios|scripts)/' },
            to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] }
        },

        {
            name: 'module-internals-are-private',
            comment:
                "A module has one public path, `@modules/<name>`, and the moment anything reaches past it the module stops being deletable. `eslint-plugin-boundaries` states this for one module reaching another and cannot state it for the tiers that are not modules: `src/app/` reaching `@modules/account/session/jwt` passes every lint rule. This is that gap, for all thirteen at once. Scoped to `from: ^src/` on purpose — `scenarios/<name>.ts` needs its own module's repository, model and factories directly, and sits outside `src/` precisely so this rule does not reach it.",
            severity: 'error',
            from: { path: '^src/', pathNot: '^src/modules/[^/]+/' },
            to: { path: String.raw`^src/modules/[^/]+/(?!index\.ts|module\.ts)` }
        },

        {
            name: 'src-cannot-reach-scenarios',
            comment:
                "scenarios/ imports a module's repository, model and factories directly — the inversion that lets a production image omit the folder outright, but only if nothing PRODUCTION under src/ reaches it, even transitively through a helper. No file under src/ is exempt: the demo's control surface lives in scenarios/support/demo.ts and reaches the app by being passed to createApp as an extension. A co-located spec is exempted for an unrelated reason: it boots the real app over supertest, and every contract/integration test does that regardless of scenarios/ — a production image never ships tests/ either way.",
            severity: 'error',
            from: {
                path: '^src/',
                pathNot: '/tests/'
            },
            to: { path: '^scenarios/', reachable: true }
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
            name: 'foundation-cannot-reach-shop',
            comment:
                "A `group: foundation` module ships with every deployment; a `group: shop` one is the demo shop's own worked example, deletable on its own (see docs/theory/strategic-ddd.md). The arrow only points one way — a SHOP module reaching another shop module, or a foundation module reaching another foundation module, is untouched by this rule and is `moduleCouplingRules`' concern instead. Relabel the importing module in its own `module.yaml` if the coupling is actually intentional; don't widen this rule to let it through.",
            severity: 'error',
            from: {
                path: `^src/modules/(${FOUNDATION_MODULES.join('|')})/`,
                // A co-located spec legitimately boots the whole app over supertest (every
                // contract/integration test does — see `src-cannot-reach-scenarios`'s own
                // reasoning), which reaches every module including the shop's. That is the test
                // suite exercising the app, not a foundation module coupling itself to the shop.
                pathNot: `^src/modules/(${FOUNDATION_MODULES.join('|')})/tests/`
            },
            to: { path: `^src/modules/(${SHOP_MODULES.join('|')})/`, reachable: true }
        },

        {
            name: 'nothing-reaches-example',
            comment:
                'The `example` module exists only to be copied and deleted. If any other module could reach it, deleting it would break that module, and the lesson would turn into a dependency. A module that wants what `example` shows copies it; it does not import it. A co-located spec boots the whole app and is exempt for the same reason as in `foundation-cannot-reach-shop`.',
            severity: 'error',
            from: {
                path: `^src/modules/(${[...FOUNDATION_MODULES, ...SHOP_MODULES].join('|')})/`,
                pathNot: `^src/modules/(${[...FOUNDATION_MODULES, ...SHOP_MODULES].join('|')})/tests/`
            },
            to: { path: `^src/modules/(${EXAMPLE_MODULES.join('|')})/`, reachable: true }
        },

        {
            name: 'example-cannot-reach-shop',
            comment:
                'The `example` module may use the foundation (it reads the owner from `users`) and nothing of the demo shop, so it survives `demo:remove` and stays a lesson in the module shape rather than in the shop.',
            severity: 'error',
            from: {
                path: `^src/modules/(${EXAMPLE_MODULES.join('|')})/`,
                pathNot: `^src/modules/(${EXAMPLE_MODULES.join('|')})/tests/`
            },
            to: { path: `^src/modules/(${SHOP_MODULES.join('|')})/`, reachable: true }
        },

        {
            name: 'not-to-unresolvable',
            comment:
                'A specifier dependency-cruiser cannot resolve to a file on disk at all — the case `not-to-dev-dep` and `no-non-package-json` above cannot catch, since both need a resolved module to classify. Left unchecked, deleting a module (or a package) can leave a dangling import that still "passes" every other rule here. `tests/load/*.js` is exempted: k6\'s own `k6`/`k6/http` are injected by the k6 binary at run time, not an npm dependency, and dependency-cruiser has no way to see them.',
            severity: 'error',
            from: { pathNot: '^tests/load/' },
            to: { couldNotResolve: true }
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
         * `not-to-unresolvable`'s reason to exist: without reading a package's own `exports`
         * field, dependency-cruiser falls back to a plain file-system lookup for every subpath
         * import, which fails for any package that only ships its real files under `dist/` (or
         * similar) and maps the public subpath onto them through `exports` — `altcha-lib`,
         * `@casl/ability/extra` and `@opentelemetry/semantic-conventions/incubating` all do this,
         * and so, for its own bare `.` entry, does `@typescript-eslint/utils`. Six false alarms
         * from `not-to-unresolvable`, cleared by resolving the way Node itself would.
         * https://github.com/webpack/enhanced-resolve#resolver-options
         */
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default', 'types']
        },

        /*
         * The RUNTIME graph, deliberately — `tsPreCompilationDeps` is left off.
         *
         * Turned on, the graph also carries `import type` edges, and every rule here then reports
         * on a graph that does not exist after compilation. It showed up immediately: eight
         * "cycles" across `cache.ts`, `queue.ts`, `dependency-health.ts` and the payments provider port,
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
            // Anchored to the repo root: an unanchored `(^|/)` also matches `node_modules/*/dist/`,
            // which drops 18 packages (yaml among them) out of the graph entirely — silencing any
            // rule that names them, `not-to-dev-dep` included.
            path: String.raw`^(tmp|\.dev|\.prism|dist)/`
        },

        reporterOptions: {
            text: { highlightFocused: true }
        }
    }
};

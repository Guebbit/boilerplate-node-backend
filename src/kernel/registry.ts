/**
 * The module registry.
 *
 * A module is a value, not a convention: everything it needs the application to do *for* it is
 * declared in one typed object, so "what does this domain touch" is answerable by reading one file
 * rather than grepping ten. `src/modules.ts` lists the enabled modules; this file is what turns
 * that list into a running application.
 *
 * The registry deliberately does not discover modules from the filesystem. An explicit list is the
 * honest answer to "what is in this build?", it stays statically typed, and enabling or disabling a
 * domain is a one-line edit rather than a folder move.
 */

import type { Router } from 'express';
import type { SeedOutcome } from '@infrastructure/persistence/seed';
import type { LocaleOverrideProvider } from '@infrastructure/i18n';

/**
 * How this module treats the one it depends on — the label on the arrow, not just the arrow.
 *
 * A bare dependency list says two domains touch. It does not say what kind of touching, and that is
 * the question that decides what a change upstream costs: whether the downstream absorbs the
 * upstream's model whole, asks it to do a job, or speaks a vocabulary it publishes. The four names
 * below are the only shapes this codebase actually has, and each maps to something visible in the
 * import:
 *
 * - `conformist` — the downstream reads the upstream's records as they are, with no translation and
 *   no say in their shape. Cheapest to write and the one that hurts when the upstream changes:
 *   `orders` embedding the product schema is the purest case in the repo.
 * - `customer-supplier` — the downstream asks the upstream to *do* something, and the upstream's
 *   public surface is shaped by that demand. `cart → orders` exists because a checkout has to
 *   place an order.
 * - `published-language` — the upstream offers vocabulary rather than records: pure functions,
 *   constants and types over plain data. The strongest edge to have, because neither side learns
 *   the other's storage. `cart → delivery` reaches only `findShippingMethod` and `priceShipping`.
 * - `shared-kernel` — both modules read and write the same model. Genuinely expensive: a change to
 *   that model has to be agreed by both, so this is the one to keep near zero. There is exactly one
 *   (`account → users`), and `tests/cross-cutting/context-map.test.ts` fails if a second appears
 *   without the allowlist being edited on purpose.
 *
 * Anticorruption layer is deliberately absent. It is the right pattern for a model you do not
 * control, and everything nameable here is a sibling in this repo — `payments` does wrap an outside
 * provider that way, but behind `./providers`, which is not a registry edge.
 */
export type ContextRelationship =
    | 'conformist'
    | 'customer-supplier'
    | 'published-language'
    | 'shared-kernel';

/** One edge of the context map: who is depended on, how, and why that shape. */
export interface ContextEdge {
    /** The sibling module's registry name. */
    module: string;

    /** What kind of relationship this is. See `ContextRelationship`. */
    as: ContextRelationship;

    /**
     * One sentence, present tense, naming what is actually reached across the edge.
     *
     * Required rather than optional on purpose: an edge whose reason cannot be written in a line is
     * usually two edges, or a module boundary in the wrong place. This is the sentence a reader
     * gets instead of re-deriving the relationship from the import list.
     */
    because: string;
}

/**
 * Where this module sits in the business, in the strategic-DDD sense — and therefore how much
 * modelling it is worth.
 *
 * The classification is the input to every "should this grow an aggregate?" question, so it lives
 * in the manifest rather than in a document that can quietly stop matching the code:
 *
 * - `core` — the reason the product exists. Worth entities, value objects and invariants.
 * - `supporting` — specific to this business but not a differentiator. Keep it plain.
 * - `generic` — a solved problem, interchangeable with an off-the-shelf one. Modelling effort here
 *   is waste, which is why `tests/cross-cutting/subdomain-discipline.test.ts` refuses a `domain/`
 *   folder inside a generic module.
 *
 * In a boilerplate these values are a worked example, not a finding: a starter kit has no core
 * domain, and the first real thing a project does is re-decide them. See `DDD_EXPLORATION.md` §7.
 */
export type Subdomain = 'core' | 'supporting' | 'generic';

/** What every module declares, whether or not it serves HTTP. */
interface AppModuleCommon {
    /** Registry identity. Must match the folder name under `src/modules/`. */
    name: string;

    /**
     * Which of the three kinds of subdomain this is. Required, because the interesting answer is
     * the one nobody wants to write down: most modules are not core, and a field that can be
     * omitted collects only the flattering half of the truth.
     */
    subdomain: Subdomain;

    /**
     * This module's ubiquitous language: the terms it uses, defined as it means them.
     *
     * Kept here rather than in a shared glossary because the same word legitimately means different
     * things in two contexts — that divergence *is* the bounded-context pattern, and a single list
     * flattens it. It also keeps the promise the rest of this file makes: adding a domain edits no
     * file outside its own folder, and `rm -rf` takes the vocabulary with the code.
     *
     * Write what the term means *in this module*, not what it means in general.
     */
    language: Readonly<Record<string, string>>;

    /**
     * Modules this one imports from, each with the shape of the relationship. Declared rather than
     * inferred, because the point is to fail at boot with a sentence instead of at the first
     * request with a 500 — and, since the edges are typed, to make "what does a change to products
     * cost" answerable by reading one field.
     *
     * This must stay a DAG. Two modules that each need the other are not a dependency pair — they
     * are one module, or they communicate through domain events. See `kernel/events.ts`.
     */
    dependsOn?: readonly ContextEdge[];

    /**
     * Attach this module's domain-event handlers. Called once at boot, after every module is known
     * and validated, so a handler may safely reference any module it declared in `dependsOn`.
     */
    subscribe?: () => void;

    /**
     * Absolute path to this module's `locales/` directory, holding one `<locale>.json` per
     * language it contributes.
     *
     * A path rather than the loaded dictionaries, so a module never enumerates the languages: the
     * supported list is decided by the deployment (`NODE_SUPPORTED_LOCALES`, or the shared
     * directory's contents), and a module simply supplies whichever of them it has a file for.
     * `app.ts` hands these to `registerLocaleDirectories` before `i18next.init()`.
     */
    locales?: string;

    /**
     * Supplies runtime overrides for the API's OWN dictionaries, keyed by locale, already nested.
     *
     * The deployed files are defaults; this is how an edit made by someone with no code editor
     * reaches `t()`. At most one module declares it — the one that owns the collection the edits
     * live in — and `app.ts` hands it to `registerLocaleOverrideProvider` at boot, the same
     * inversion `locales` above uses.
     *
     * Optional, and unregistered is a working state: without it every language resolves from its
     * file, which is what the deployment did before overrides existed.
     */
    localeOverrides?: LocaleOverrideProvider;

    /**
     * Write this module's slice of the demo dataset. Called only by `db/demo/index.ts`, never at
     * boot — seeding is a script, not part of starting the application.
     *
     * Declared here so the seeder can run without naming a domain: it walks `enabledModules` and
     * calls whatever it finds. A module with no demo data simply omits it.
     */
    seeds?: () => Promise<SeedOutcome[]>;
}

/**
 * What a published collection is to the consumer reading it.
 *
 * `response` — a GET answers with this row as it stands, so a mock may hand it straight back.
 * `stored` — no endpoint serves the row raw. The response is composed around it, or the row backs
 * an endpoint that answers with something else entirely, and a consumer that returns it verbatim
 * is describing an API that does not exist.
 *
 * Two values rather than three, because two is the whole of the question anyone asks of the
 * dataset. `addressBooks` are wrapped (`GET /account/addresses` answers `{ addresses: [...] }`) and
 * `locales` are never served at all (`GET /locales` answers a composed capabilities envelope), and
 * those differ only in HOW the response is built — which the consumer is writing anyway.
 */
export type DemoShape = 'response' | 'stored';

/**
 * The demo export, and the classification of what it publishes.
 *
 * A union rather than two optional fields, so declaring one without the other is a type error at
 * the manifest — the same reason `basePath` and `routes` arrive together. An unclassified
 * collection is the failure this exists to prevent, and it cannot be caught later: the artefact is
 * consumed by a sibling repo, where "is this row servable?" has no local answer.
 */
type DemoExport =
    | {
          /**
           * Read this module's seeded rows back in the shape the API serves them, keyed by
           * collection.
           *
           * The other half of `seeds`, and declared for the same reason: `scripts/export-seed.ts`
           * walks `enabledModules` and publishes whatever it finds as `db/demo/demo-data.json`, so
           * it names no domain and deleting a module takes its section of the dataset with it.
           *
           * It must read back through the model's `toJSON` — the real serializer — rather than
           * returning the fixtures it wrote. That is the entire point of the export: the published
           * dataset records what the API actually produces, schema defaults and derived fields
           * included, so the paired frontend's mocks stop guessing at them. A module that returned
           * its own fixtures here would publish the guess and label it as truth.
           */
          seedExport: () => Promise<Record<string, unknown[]>>;

          /**
           * One entry per collection `seedExport` returns, published as `_meta.shapes`.
           *
           * The knowledge lives beside the rows because the reader who needs it is in the other
           * repo, writing a mock handler against the artefact and nothing else. Stated here rather
           * than derived from the schemas: a matcher would label the `locales` rows `response`,
           * since a stored language happens to parse against the CREATE response, and a confidently
           * wrong label is worse than none.
           *
           * `scripts/export-seed.ts` refuses to publish a collection this omits, and
           * `tests/cross-cutting/seed-conformance.test.ts` holds the committed artefact to the same
           * rule in both repos.
           */
          demoShapes: Readonly<Record<string, DemoShape>>;
      }
    | { seedExport?: never; demoShapes?: never };

/** A module that serves HTTP. `basePath` and `routes` are meaningless apart, so they arrive together. */
interface RoutedModule extends AppModuleCommon {
    /** Mount point for `routes`, e.g. `/products`. */
    basePath: string;

    /** The domain's express router, mounted at `basePath`. */
    routes: Router;
}

/**
 * A module that owns a collection but no URL — `audit-logs` writes and reads the audit trail, and
 * the endpoint that exposes it belongs to `observability`.
 *
 * The `never`s are what make this a real alternative rather than two optional fields: declaring a
 * router without a mount point, or a mount point with nothing to mount, is a type error at the
 * manifest rather than a route that silently never registers.
 */
interface HeadlessModule extends AppModuleCommon {
    basePath?: never;
    routes?: never;
}

/**
 * Everything a module declares about itself.
 *
 * Keep this small. A field that only one module ever fills does not belong here — that module
 * should do the thing itself, behind its own barrel. The cost of a wide manifest is that every
 * module has to be read against it to know which half applies.
 *
 * Two of these fields — `subdomain` and `language` — are read by nothing at runtime, which looks
 * like it breaks that rule. It does not: the manifest is where a module says what it *is* to the
 * rest of the system, and its place in the business and the words it uses are statements of exactly
 * that kind. Kept anywhere else they would be a second description of the module, free to drift
 * from the first. Both are asserted by `tests/cross-cutting/`, so they are checked declarations
 * rather than comments.
 */
export type AppModule = (RoutedModule | HeadlessModule) & DemoExport;

/**
 * Reject duplicate names, unknown dependencies and dependency cycles.
 *
 * Runs before anything is mounted: a misconfigured registry should stop the boot, not degrade the
 * running server. The cycle walk is an iterative depth-first search with an explicit "in progress"
 * set, which reports the offending path rather than just the fact of a cycle.
 *
 * @param appModules - the enabled module list, in registration order
 */
export const validateModules = (appModules: AppModule[]): void => {
    const byName = new Map<string, AppModule>();

    // Pass 1 — index by name, rejecting a duplicate registration on the way.
    for (const appModule of appModules) {
        if (byName.has(appModule.name))
            throw new Error(`Module "${appModule.name}" is registered twice in src/modules.ts`);
        byName.set(appModule.name, appModule);
    }

    // Pass 2 — every named dependency must be enabled, checked before the walk needs it.
    for (const appModule of appModules)
        for (const edge of appModule.dependsOn ?? []) {
            if (!byName.has(edge.module))
                throw new Error(
                    `Module "${appModule.name}" depends on "${edge.module}", which is not enabled. ` +
                        `Add it to src/modules.ts or drop the dependency.`
                );
            // A module that depends on itself is a typo, and the cycle walk below would report it
            // as a one-hop loop rather than as the mistake it is.
            if (edge.module === appModule.name)
                throw new Error(`Module "${appModule.name}" declares a dependency on itself.`);
        }

    // `settled` is proven acyclic; `walking` is the current path, so a hit on it IS the cycle.
    const settled = new Set<string>();
    const walking = new Set<string>();

    // Depth-first, carrying `trail` so the error can print the path rather than just assert one.
    const walk = (name: string, trail: string[]): void => {
        if (settled.has(name)) return;
        if (walking.has(name))
            throw new Error(
                `Module dependency cycle: ${[...trail, name].join(' → ')}. ` +
                    `Sibling communication that is not a straight dependency belongs in a domain ` +
                    `event, not an import.`
            );

        walking.add(name);
        for (const edge of byName.get(name)?.dependsOn ?? []) walk(edge.module, [...trail, name]);
        // Off the current path, onto the settled set: this subtree is clean.
        walking.delete(name);
        settled.add(name);
    };

    // Every module is a possible root — a disconnected pair still has to be checked.
    for (const appModule of appModules) walk(appModule.name, []);
};

/**
 * Validate the registry, then let every module attach its domain-event handlers.
 *
 * Subscription is separated from mounting because a handler may fire for an event another module
 * emits while serving a request, so every subscription has to exist before the first route does.
 *
 * @param appModules - the enabled module list
 */
export const registerModules = (appModules: AppModule[]): void => {
    validateModules(appModules);
    // After validation, so a handler may safely reach any sibling it declared in `dependsOn`.
    for (const appModule of appModules) appModule.subscribe?.();
};

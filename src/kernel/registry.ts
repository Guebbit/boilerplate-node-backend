/**
 * The module registry: what turns the list in `src/modules.ts` into a running application.
 *
 * A module is a typed value, not a folder convention — everything it needs the application to do
 * *for* it is declared in one object. Modules are listed explicitly rather than discovered from
 * the filesystem, so the list stays statically typed and enabling a domain is a one-line edit.
 *
 * See: docs/theory/modules.md#the-manifest
 */

import type { Router } from 'express';
import type { SeedOutcome } from '@infrastructure/persistence/seed';
import type { LocaleOverrideProvider } from '@infrastructure/i18n';

/**
 * How this module treats the one it depends on — the label on the arrow, not just the arrow.
 *
 * - `conformist` — reads the upstream's records as they are, no translation, no say.
 * - `customer-supplier` — asks the upstream to *do* something; its surface answers the demand.
 * - `published-language` — receives vocabulary, not records: pure functions over plain data.
 * - `shared-kernel` — both read and write the same model. The expensive one; kept near zero.
 *
 * See: docs/theory/strategic-ddd.md#_2-context-map-—-typed-edges
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
     * One sentence, present tense, naming what is actually reached across the edge. Required, not
     * optional: an edge whose reason will not fit in a line is usually two edges.
     */
    because: string;
}

/**
 * Where this module sits in the business, and therefore how much modelling it is worth.
 *
 * - `core` — the reason the product exists. Worth entities, value objects and invariants.
 * - `supporting` — specific to this business but not a differentiator. Keep it plain.
 * - `generic` — a solved problem. Modelling effort here is waste, so
 *   `tests/cross-cutting/subdomain-discipline.test.ts` refuses a `domain/` folder inside one.
 *
 * See: docs/theory/strategic-ddd.md#_4-subdomain-distillation-—-where-to-spend-effort
 */
export type Subdomain = 'core' | 'supporting' | 'generic';

/** What every module declares, whether or not it serves HTTP. */
interface AppModuleCommon {
    /** Registry identity. Must match the folder name under `src/modules/`. */
    name: string;

    /** Which of the three kinds of subdomain this is. Required — see `Subdomain`. */
    subdomain: Subdomain;

    /**
     * Modules this one imports from, each with the shape of the relationship.
     *
     * Must stay a DAG. Two modules that each need the other are one module, or they communicate
     * through domain events — see `kernel/events.ts`.
     */
    dependsOn?: readonly ContextEdge[];

    /**
     * Attach this module's domain-event handlers. Called once at boot, after every module is known
     * and validated, so a handler may safely reference any module it declared in `dependsOn`.
     */
    subscribe?: () => void;

    /**
     * Absolute path to this module's `locales/` directory, holding one `<locale>.json` per language
     * it contributes.
     *
     * A path rather than loaded dictionaries, so a module never enumerates languages: the supported
     * list is a deployment decision and a module supplies whichever of them it has a file for.
     * `app.ts` passes these to `registerLocaleDirectories` before `i18next.init()`.
     */
    locales?: string;

    /**
     * Supplies runtime overrides for the API's own dictionaries, keyed by locale, already nested.
     * At most one module declares it — the one owning the collection the edits live in.
     *
     * Optional, and unregistered is a working state: every language then resolves from its file.
     */
    localeOverrides?: LocaleOverrideProvider;

    /**
     * Write this module's slice of the demo dataset. Called only by `db/demo/index.ts`, never at
     * boot — seeding is a script, not part of starting the application.
     */
    seeds?: () => Promise<SeedOutcome[]>;
}

/**
 * What a published collection is to the consumer reading it.
 *
 * `response` — a GET answers with this row as it stands, so a mock may hand it straight back.
 * `stored` — no endpoint serves the row raw; a consumer returning it verbatim would describe an
 * API that does not exist.
 *
 * See: docs/tools/demo-profile.md
 */
export type DemoShape = 'response' | 'stored';

/**
 * The demo export, and the classification of what it publishes.
 *
 * A union rather than two optional fields, so declaring one without the other is a type error at
 * the manifest: an unclassified collection cannot be caught later, because the artefact is consumed
 * by a sibling repo where "is this row servable?" has no local answer.
 */
type DemoExport =
    | {
          /**
           * Read this module's seeded rows back in the shape the API serves them, keyed by
           * collection. `scripts/export-seed.ts` walks `enabledModules` and publishes what it finds.
           *
           * **Must read back through the model's `toJSON`** — the real serializer — rather than
           * returning the fixtures it wrote. Returning fixtures publishes a guess labelled as truth.
           */
          seedExport: () => Promise<Record<string, unknown[]>>;

          /**
           * One entry per collection `seedExport` returns, published as `_meta.shapes`.
           *
           * Stated rather than derived: a matcher would label the `locales` rows `response`, since a
           * stored language happens to parse against the CREATE response, and a confidently wrong
           * label is worse than none.
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
 * the endpoint exposing it belongs to `observability`.
 *
 * The `never`s make this a real alternative rather than two optional fields: a router without a
 * mount point is a type error rather than a route that silently never registers.
 */
interface HeadlessModule extends AppModuleCommon {
    basePath?: never;
    routes?: never;
}

/**
 * Everything a module declares about itself.
 *
 * Keep this small: a field only one module ever fills belongs behind that module's own barrel.
 * `subdomain` is read by nothing at runtime and still belongs here, because a test acts on it —
 * a `generic` module may carry no `domain/` folder. A field nothing reads and nothing checks is a
 * comment with extra syntax; the module's vocabulary was one, and now lives in
 * `docs/theory/glossary.md`.
 *
 * See: docs/theory/modules.md#the-manifest
 */
export type AppModule = (RoutedModule | HeadlessModule) & DemoExport;

/**
 * Reject duplicate names, unknown dependencies and dependency cycles.
 *
 * Runs before anything is mounted: a misconfigured registry should stop the boot, not degrade the
 * running server.
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
            // A self-dependency is a typo, and the walk below would report it as a one-hop loop
            // rather than as the mistake it is.
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

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
           * collection. `scripts/export-demo-dataset.ts` walks `enabledModules` and publishes what it finds.
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

/**
 * Everything a module declares about itself.
 *
 * Keep this small: a field only one module ever fills belongs behind that module's own barrel, and
 * a field nothing reads at runtime is a comment with extra syntax. What a module depends on is its
 * `import` statements; how it relates to a sibling is prose, and belongs in the docblock above the
 * manifest where a reader will actually meet it.
 *
 * See: docs/theory/modules.md#the-manifest
 */
export type AppModule = {
    /** Registry identity. Must match the folder name under `src/modules/`. */
    name: string;

    /**
     * Mount point for `routes`, e.g. `/products`. Absent on a module that owns a collection but no
     * URL — `audit-logs` writes and reads the audit trail, and the endpoint exposing it belongs to
     * `observability`.
     */
    basePath?: string;

    /** The domain's express router, mounted at `basePath`. */
    routes?: Router;

    /**
     * Attach this module's domain-event handlers. Called once at boot, after every module is known,
     * so a handler may safely reference any sibling.
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
     * Write this module's slice of the demo dataset. Called only by `db/demo/index.ts`, never at
     * boot — seeding is a script, not part of starting the application.
     */
    seeds?: () => Promise<SeedOutcome[]>;
} & DemoExport;

/**
 * Let every module attach its domain-event handlers.
 *
 * Subscription is separated from mounting because a handler may fire for an event another module
 * emits while serving a request, so every subscription has to exist before the first route does.
 *
 * @param appModules - the enabled module list
 */
export const registerModules = (appModules: AppModule[]): void => {
    for (const appModule of appModules) appModule.subscribe?.();
};

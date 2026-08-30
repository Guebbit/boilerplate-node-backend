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
 * A module's writeback for the image digest pipeline — how the worker (or the no-broker inline
 * fallback) turns a finished digest into a persisted `imageUrl`/`thumbnailUrl` on ITS collection.
 *
 * `infrastructure/adapters/image.worker.ts` may not import `src/modules/*` (see
 * IMAGE_PIPELINE_PLAN.md's "the writeback problem"), so it cannot call a module's repository
 * directly. A module registers this instead, keyed under `imageTargets` on its manifest, and the
 * worker resolves it by the `collection` string its job payload carries.
 */
export interface ImageTarget {
    /**
     * Write the digested urls onto the document named by `documentId`, but ONLY if it still names
     * `key` as its `pendingImageKey`. That guard is what makes a stale or duplicate job delivery
     * (redelivered after a crash, or superseded by a second upload) a no-op instead of an
     * overwrite, and what turns a deleted document into a detectable miss rather than a write to
     * nothing.
     *
     * @param documentId - the target document's id
     * @param key - the quarantine key this digest was produced from
     * @param urls - the promoted image and thumbnail urls to persist
     * @returns whether a document actually matched and was updated
     */
    writeback: (
        documentId: string,
        key: string,
        urls: { imageUrl: string; thumbnailUrl: string }
    ) => Promise<boolean>;
}

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

    /**
     * This module's {@link ImageTarget}s, keyed by the `collection` string an
     * `ImageDigestJobPayload` names. Most modules have none; a module whose documents can carry an
     * uploaded image registers one entry per such collection.
     */
    imageTargets?: Readonly<Record<string, ImageTarget>>;
} & DemoExport;

/**
 * Every registered module's {@link ImageTarget}s, flattened into one lookup keyed by `collection`.
 *
 * Built from the passed-in list rather than importing `enabledModules` itself, for the same reason
 * {@link registerModules} takes one: this file must stay free of any `src/modules/*` import, so
 * that `infrastructure/adapters/image.worker.ts` — which needs exactly this lookup, and may not
 * import a module directly — can depend on `kernel/registry.ts` without a cycle. The app tier
 * builds the lookup once (`app/workers.ts`) and hands the worker a plain resolver function.
 *
 * @param appModules - the enabled module list
 */
export const resolveImageTargets = (
    appModules: AppModule[]
    // `| undefined` stated explicitly: `noUncheckedIndexedAccess` is off project-wide, so without
    // this a lookup by an unregistered `collection` string would type-check as always present.
): Readonly<Record<string, ImageTarget | undefined>> =>
    Object.fromEntries(
        appModules.flatMap((appModule) => Object.entries(appModule.imageTargets ?? {}))
    );

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

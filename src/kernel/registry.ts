/**
 * @module
 * The module registry: what turns the list in `src/modules.ts` into a running application.
 *
 * A module is a typed value, not a folder convention — everything it needs the application to do
 * *for* it is declared in one object. Modules are listed explicitly rather than discovered from
 * the filesystem, so the list stays statically typed and enabling a domain is a one-line edit.
 *
 * See: docs/theory/modules.md#the-manifest
 */

import type { Router } from 'express';
import { assertRequiredConfig } from '@kernel/required-config';

/**
 * One environment variable a module cannot run without. Declared on
 * the manifest rather than asserted inside the module itself: only the app tier can refuse to
 * boot, and collecting every module's list in one place ({@link registerModules}) reports every
 * offending variable at once, not one restart per mistake.
 */
export interface RequiredConfig {
    /** The env var name. */
    key: string;
    /** The shortest acceptable value — catches an empty or drastically truncated secret. */
    minLength: number;
    /**
     * The `.env-example` placeholder this value must never still equal in a real deployment.
     * Omitted where the shipped value is a legitimate local one rather than a stand-in.
     */
    placeholder?: string;
    /**
     * Check only under `NODE_ENV=production`. For a variable whose code-side default is correct
     * for a developer and certainly wrong for a deployment.
     */
    productionOnly?: boolean;
}

/**
 * A module's writeback for the image digest pipeline — how the worker (or the no-broker inline
 * fallback) turns a finished digest into a persisted `imageUrl`/`thumbnailUrl` on ITS collection.
 *
 * `infrastructure/adapters/image.worker.ts` may not import `src/modules/*` (see
 * docs/tools/image-processing.md#architecture), so it cannot call a module's repository
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
 * A module's declaration that one of its collections carries user-authored content a translation
 * write needs to validate against and invalidate the cache of.
 *
 * `infrastructure/i18n`'s translation resolver cannot import `src/modules/*` either (same wall as
 * {@link ImageTarget}: `translation.ts` cannot be an import from `products` into `locales`, per
 * docs/theory/modules.md and `boundaries/dependencies` in `eslint.config.ts`). A module registers
 * this instead, keyed under `translatables` on its manifest by the `entityType` string a
 * translation row and the `/translations/{entityType}/{id}` route both use.
 */
export interface TranslatableTarget {
    /** The mongo collection a translation write updates a derived, sortable/indexable copy on. */
    collection: string;

    /**
     * Field names on this collection a translation row may carry. Validated against at write
     * time — a translation naming a field this list does not declare is a 422, not a silently
     * accepted key nothing ever reads.
     */
    fields: readonly string[];

    /**
     * The cache tag `invalidateCache` must clear when a translation write lands. The precedent is
     * `infrastructure/adapters/image.worker.ts`, which already clears the `products` tag from
     * outside the module that owns it.
     */
    cacheTag: string;
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
export interface AppModule {
    /** Registry identity. Must match the folder name under `src/modules/`. */
    name: string;

    /**
     * Mount point for `routes`, e.g. `/products`. Absent on a module that owns a collection but no
     * URL of its own — a domain reachable only through another module's endpoints, or through no
     * endpoint at all.
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
     * The permission keys this module INTRODUCES, next to the routes that check them.
     *
     * Declared here rather than only in `shared/authorization-keys.yaml` so that deleting a module
     * deletes its keys: the shared file says which module owns each key, this says which keys each
     * module claims, and `tests/cross-cutting/module-permissions.test.ts` refuses any disagreement.
     * A key whose module is gone would otherwise sit in the file forever, grantable by a role
     * editor and checked by nothing.
     *
     * Absent for a module with no keys, which is a decision rather than an omission: `cart` and
     * `wishlist` are *your own things*, and what you may do with them follows from being signed in.
     */
    permissions?: readonly string[];

    /**
     * This module's {@link ImageTarget}s, keyed by the `collection` string an
     * `ImageDigestJobPayload` names. Most modules have none; a module whose documents can carry an
     * uploaded image registers one entry per such collection.
     */
    imageTargets?: Readonly<Record<string, ImageTarget>>;

    /**
     * This module's {@link TranslatableTarget}s, keyed by the `entityType` string a translation
     * row and the `/translations/{entityType}/{id}` route both use. Most modules have none; a
     * module whose documents carry user-authored content registers one entry per such collection.
     */
    translatables?: Readonly<Record<string, TranslatableTarget>>;

    /**
     * Paths whose callers SIGN the request body, so the JSON parser must keep the bytes verbatim.
     * Relative to `basePath`, the same way `routes` is.
     *
     * Declared here rather than in `app/security.ts` because the body is consumed once, by the
     * parser the app tier installs — long before this module's own router runs. Every entry costs
     * one buffer copy per matching request, so a module should list as few as it can.
     */
    rawBodyPaths?: readonly string[];

    /**
     * Env vars this module cannot run without — see {@link RequiredConfig}. Most modules have
     * none; `account` and `observability` each hold a secret that must not boot on a placeholder.
     */
    requiredConfig?: readonly RequiredConfig[];

    /**
     * The states this module GUARANTEES a named scenario seeds, keyed by scenario name (currently
     * only `shop`). `scenarios/check.ts` fails the build until every key here is actually present
     * in what got seeded — declared here rather than only inside `scenarios/` so deleting a module
     * deletes its guarantees the same way {@link permissions} does.
     *
     * Absent for a module with nothing to guarantee, which is most of them: `antibot`, `api-keys`,
     * `feedback` and `observability` say nothing, on purpose.
     */
    scenario?: Readonly<Record<string, readonly string[]>>;
}

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
 * Every registered module's {@link TranslatableTarget}s, flattened into one lookup keyed by
 * `entityType`.
 *
 * Built from the passed-in list for the same reason {@link resolveImageTargets} is: this file
 * must stay free of any `src/modules/*` import, so the translation resolver — which needs exactly
 * this lookup and may not import a module directly — can depend on `kernel/registry` without a
 * cycle. The `app` tier builds the lookup once, the way `app/workers.ts` builds `imageTargets`.
 *
 * @param appModules - the enabled module list
 */
export const resolveTranslatables = (
    appModules: AppModule[]
    // `| undefined` stated explicitly: `noUncheckedIndexedAccess` is off project-wide, so without
    // this a lookup by an unregistered `entityType` string would type-check as always present.
): Readonly<Record<string, TranslatableTarget | undefined>> =>
    Object.fromEntries(
        appModules.flatMap((appModule) => Object.entries(appModule.translatables ?? {}))
    );

/**
 * Let every module attach its domain-event handlers.
 *
 * Subscription is separated from mounting because a handler may fire for an event another module
 * emits while serving a request, so every subscription has to exist before the first route does.
 * Config is asserted first, for the same "before the first route" reason.
 *
 * @param appModules - the enabled module list
 * @throws when {@link assertRequiredConfig} refuses to boot
 */
export const registerModules = (appModules: AppModule[]): void => {
    assertRequiredConfig(appModules);
    for (const appModule of appModules) appModule.subscribe?.();
};

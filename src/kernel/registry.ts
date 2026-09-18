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
import type { ZodType } from 'zod';
import { assertRequiredConfig, type NonModuleChecks } from '@kernel/required-config';
import type { RateLimitBudget } from '@types';

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
 * A module's own queue consumer — the same "app tier sees every module, infrastructure sees none
 * of them" split {@link ImageTarget} is built around, generalized to a whole consumer instead of
 * one writeback callback. `infrastructure/adapters/queue.ts`'s `consumeFromQueue` cannot be called
 * from inside a module's own `module.ts` (that would run the moment the module is imported, before
 * `app/workers.ts` has decided whether the broker is even enabled); a module registers the
 * declaration instead, keyed under `consumers`, and `app/workers.ts` is what actually calls
 * `consumeFromQueue` for each one it collects.
 *
 * `handler` is written as a method, not a property, on purpose: every module's job payload is a
 * different generated type, and only a method member lets each one keep its own — a property
 * function type would force every handler down to `unknown`, unlike {@link ImageTarget.writeback},
 * whose signature is genuinely identical for every module that has one.
 */
export interface ModuleConsumer {
    /** Queue name to consume from — one of `WORKER_CHANNELS` (`@types`, generated). */
    queue: string;

    /** Handler called for each message. Return true to ack, false to nack. */
    handler(message: unknown): Promise<boolean>;

    /**
     * The contract schema this queue's messages must satisfy, from `@types`'s generated
     * validators — see `infrastructure/adapters/queue.ts`'s `ConsumeOptions.schema` for what
     * supplying it buys over leaving the handler to defend itself.
     */
    schema?: ZodType;

    /** Number of unacknowledged messages allowed at once. Default: 1 — see `ConsumeOptions.prefetch`. */
    prefetch?: number;
}

/**
 * A module's declaration that one of its collections carries user-authored content a translation
 * write needs to validate against and invalidate the cache of.
 *
 * `kernel/translation.ts`'s translation resolver cannot import `src/modules/*` either (same wall
 * as {@link ImageTarget}: it cannot be an import from `products` into `locales`, per
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
 * Who a data-subject export is about. `email` because one module (`feedback`, tickets are not
 * tied to an account) matches its rows by address, not by id.
 */
export interface PersonalDataSubject {
    userId: string;
    email: string;
}

/**
 * What one module holds about one person, for a data-subject export (GDPR Art. 15 and 20).
 *
 * `infrastructure/adapters/*` and the kernel itself may not import `src/modules/*` — the same wall
 * {@link ImageTarget} and {@link TranslatableTarget} are built around — so `account`, which
 * assembles the export, cannot read every sibling's data directly either without importing them
 * all, which is exactly the cycle risk this manifest field removes. A module declares its own
 * section instead; the app tier collects every enabled module's and hands `account` the result the
 * same way it hands `locales` its `translatables` lookup.
 */
export interface PersonalDataSection {
    /** The key this section takes in the export envelope — matches the contract's property name. */
    section: string;

    /** Everything this module holds about the subject, already in wire shape. */
    collect: (subject: PersonalDataSubject) => Promise<unknown>;
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
     * This module's own queue consumers — see {@link ModuleConsumer}. Most modules have none; a
     * module that owns a queue registers one entry per queue it drains, so deleting the module is
     * enough to stop that queue meaning anything, with nothing left to also delete in
     * `app/workers.ts`.
     */
    consumers?: readonly ModuleConsumer[];

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
     * none; a module declares one when it owns a secret, a boot-required identity field or a
     * config value nothing else could catch before the first request that needs it.
     */
    requiredConfig?: readonly RequiredConfig[];

    /**
     * A boot-time check {@link RequiredConfig} cannot express — cross-field validation, or
     * parsing a value through a library. Returns the offending variable names; an empty array
     * means nothing is wrong. Collected into the same failure `assertRequiredConfig` throws
     * (`@kernel/required-config`), so a module-owned check is reported the same way a
     * declarative one is: named alongside every other mistake, not thrown from deep inside the
     * module on the first request that needs the value.
     */
    customCheck?: () => string[];

    /**
     * Env vars that must be ABSENT under `NODE_ENV=production` — the opposite of
     * {@link requiredConfig}, and reported with its own wording (`assertRequiredConfig`'s "set,
     * which must never happen here" rather than `customCheck`'s "missing, too short, or still
     * placeholder"). Most modules have none; a module declares one for a value that only makes
     * sense in a non-production profile — a demo/test fixture endpoint, a relaxed guard — where
     * being SET in production is itself the mistake, regardless of what it is set to.
     */
    forbiddenInProduction?: readonly string[];

    /**
     * The states this module GUARANTEES a named scenario offers, keyed by scenario name (currently
     * only `shop`). Each name resolves to one row id — pinned in `scenarios/subjects.ts` or
     * recorded by the flow runner — and `scenarios/check.ts` holds the two lists equal in both
     * directions. Declared here rather than only inside `scenarios/` so deleting a module deletes
     * its guarantees the same way {@link permissions} does.
     *
     * Absent for a module with nothing to guarantee, which is most of them, on purpose.
     */
    scenario?: Readonly<Record<string, readonly string[]>>;

    /**
     * This module's {@link RateLimitBudget}s — the data half of its own rate limiters, built into
     * the actual middleware by `buildRateLimiter`. Declared here so the generated table in
     * `docs/tools/security.md` and `tests/cross-cutting/rate-limit-budgets.test.ts` see every
     * budget without importing each module's `rate-limits.ts` by hand. Most modules have none; a
     * budget with no one owning module (the global browsing brake, the api-key budget, the upload
     * budget shared by three modules) is declared as data in infrastructure instead — see
     * `INFRASTRUCTURE_RATE_LIMITS`.
     */
    rateLimits?: readonly RateLimitBudget[];

    /**
     * What this module holds about one person, for `POST /account/export` — see
     * {@link PersonalDataSection}. REQUIRED, not optional: a new module cannot compile without
     * answering. `'none'` is the explicit, reviewed answer for a module with nothing personal to
     * export (infrastructure, or a collection with no user-linked field);
     * `tests/cross-cutting/personal-data-sections.test.ts` refuses `'none'` from a module whose
     * models carry an obvious one (`userId`, `createdByUserId`, an email the subject owns) — the
     * "you said nothing, but you hold something" case a type alone cannot catch.
     */
    personalData: readonly PersonalDataSection[] | 'none';
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
 * Every registered module's {@link ModuleConsumer}s, flattened in declaration order.
 *
 * Built from the passed-in list for the same reason {@link resolveImageTargets} is: this file
 * must stay free of any `src/modules/*` import. `app/workers.ts` is the one place allowed to see
 * every module's `consumers` and is what actually calls `consumeFromQueue` for each.
 *
 * @param appModules - the enabled module list
 */
export const resolveConsumers = (appModules: AppModule[]): readonly ModuleConsumer[] =>
    appModules.flatMap((appModule) => appModule.consumers ?? []);

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
 * Every registered module's {@link PersonalDataSection}s, flattened in declaration order —
 * `'none'` contributes nothing.
 *
 * Built from the passed-in list for the same reason {@link resolveImageTargets} is: this file must
 * stay free of any `src/modules/*` import. `src/app.ts` builds this once and hands it to `account`
 * the same way it hands `locales` its `translatables` lookup — see
 * `modules/account/services/personal-data-registry.ts`.
 *
 * @param appModules - the enabled module list
 */
export const resolvePersonalDataSections = (
    appModules: AppModule[]
): readonly PersonalDataSection[] =>
    appModules.flatMap((appModule) =>
        appModule.personalData === 'none' ? [] : appModule.personalData
    );

/**
 * Every registered module's {@link RateLimitBudget}s, flattened in declaration order.
 *
 * Built from the passed-in list for the same reason {@link resolveImageTargets} is: this file
 * must stay free of any `src/modules/*` import. `docs/tools/security.md`'s generator and
 * `tests/cross-cutting/rate-limit-budgets.test.ts` both combine this with
 * `INFRASTRUCTURE_RATE_LIMITS` for the complete list.
 *
 * @param appModules - the enabled module list
 */
export const resolveRateLimits = (appModules: AppModule[]): readonly RateLimitBudget[] =>
    appModules.flatMap((appModule) => appModule.rateLimits ?? []);

/**
 * Let every module attach its domain-event handlers.
 *
 * Subscription is separated from mounting because a handler may fire for an event another module
 * emits while serving a request, so every subscription has to exist before the first route does.
 * Config is asserted first, for the same "before the first route" reason.
 *
 * @param appModules - the enabled module list
 * @param nonModuleChecks - passed straight through to {@link assertRequiredConfig} — this file
 *   must stay free of any `src/app`/`src/modules/*` import, so the caller assembles it
 * @throws when {@link assertRequiredConfig} refuses to boot
 */
export const registerModules = (
    appModules: AppModule[],
    nonModuleChecks?: NonModuleChecks
): void => {
    assertRequiredConfig(appModules, nonModuleChecks);
    for (const appModule of appModules) appModule.subscribe?.();
};

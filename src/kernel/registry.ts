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
import type { ClientSession } from 'mongoose';
import { assertModuleConfig } from '@kernel/module-config';
import type { ConfigSlice } from '@infrastructure/config/define';
import { markDomainEventsWired } from '@kernel/events';
import type { RateLimitBudget } from '@types';

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

    /** Handler called for each message. Return true to ack, false to PARK — a permanent business rejection, never retried. Throw instead for a transient failure, which nacks and retries. */
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
     * Whether `entityId` currently names a real document on {@link collection} — checked before
     * ANY translation write, so a missing entity answers the contract's declared 404 instead of
     * writing orphan translation rows first and only discovering the miss when {@link writeDerived}
     * runs. Supplied by the OWNING module, same reasoning as {@link writeDerived}: `locales` cannot
     * resolve the target's Mongoose model by collection name to check this itself (SD-09).
     *
     * @param entityId - the id exactly as it arrived on the request path — may be malformed
     * @returns whether a document with this id exists
     */
    exists: (entityId: string) => Promise<boolean>;

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

    /**
     * Copies the fallback-locale row's fields onto this entity's own document — the derived,
     * sortable/indexable column a translated write also updates. Supplied by the OWNING module
     * (see {@link ImageTarget.writeback} for the same shape), so `locales` never has to find the
     * target's Mongoose model by collection name to reach it (SD-09).
     */
    writeDerived: (entityId: string, fields: Record<string, string | null>) => Promise<void>;

    /**
     * Stamps this entity's own document as edited, so its version (the `ETag`) moves. A translation
     * edit changes rows OUTSIDE the document, and {@link writeDerived} only runs when the fallback
     * locale changed — without this, an editor holding the old tag could still replace the
     * translations another editor just wrote. Supplied by the OWNING module, like the rest.
     */
    markEdited: (entityId: string) => Promise<void>;

    /**
     * The OWNING module's own rules for a locale's field values — the same ones its own write
     * door applies — so the generic translator's door cannot land a value the entity itself would
     * refuse (a product title under its minimum). Optional: a target with no rules beyond the
     * field names {@link fields} declares leaves it out.
     *
     * @param fields - the locale's changes: a string sets, `null` clears
     * @param isFallback - whether this is the fallback locale, whose fields are the entity's own
     * @returns one issue per broken rule; empty when the values are legal
     */
    checkFields?: (
        fields: Record<string, string | null>,
        isFallback: boolean
    ) => TranslationFieldIssue[];
}

/** One rule a locale's field values broke — see {@link TranslatableTarget.checkFields}. */
export interface TranslationFieldIssue {
    /** The field the rule is about, as the target names it. */
    field: string;
    /** Already translated, ready to show. */
    message: string;
}

/**
 * One domain event, turned into the public (webhook-visible) event `webhooks` should fan out —
 * or `undefined` when this particular payload isn't one. `order.status_changed` is why this is a
 * projection rather than a rename: it becomes `order.paid` or `order.shipped` depending on `to`,
 * and neither for any other transition, so there is no single public name to declare up front.
 */
export interface PublicEventProjection {
    /** The public event name a subscription filters on — `GET /webhooks/events`' catalogue. */
    eventType: string;

    /** The public event's payload, exactly as a subscriber receives it under the envelope's `data`. */
    data: Record<string, unknown>;
}

/**
 * A module's declaration that firing one of its domain events is also a public, webhook-visible
 * integration event.
 *
 * `webhooks/services/publish.ts` may not import `@modules/orders`/`@modules/payments` (the
 * foundation/shop boundary DDD-D1 draws) — the same wall {@link ImageTarget} and
 * {@link TranslatableTarget} are built around — so it cannot know which domain events exist to
 * listen for. A module registers this instead, keyed under `publicEvents` on its manifest by the
 * DOMAIN event name, and `webhooks` subscribes to every one it collects generically, through
 * {@link resolvePublicEvents}, instead of importing each event's name constant by hand.
 *
 * `payload` is typed `never`, the same trick `kernel/events.ts`'s own handler map uses: a
 * registry entry is stored once per domain event and called back with whatever that event's real
 * payload turns out to be, so nothing here can name a single concrete payload type. The OWNING
 * module still gets full type safety at the point it writes `toPublicEvent` itself, because a
 * function typed to take one concrete payload is assignable into a `(payload: never) => …` slot.
 */
export interface PublicEventTarget {
    /**
     * @param payload - the domain event's payload, exactly as `emitDomainEvent` published it
     * @returns the public event to fan out, or `undefined` to fire nothing for this payload
     */
    toPublicEvent: (payload: never) => PublicEventProjection | undefined;
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

    /**
     * DDD-D6: erase this section's rows for one user, given the session a hard delete's
     * transaction is running in — every write inside must take `{ session }`, or it commits
     * outside the transaction and survives a rollback the rest of the erasure didn't.
     *
     * Optional, unlike {@link collect}: a section with nothing here is folded into the erasing
     * module's own row (there is no second collection to touch), not a gap — `resolvePersonalDataErasers`
     * skips it rather than calling a no-op.
     *
     * May resolve to an {@link AfterErase}: work that must wait for the commit, because it is
     * not a database write that can roll back (a hold released, a payment intent cancelled).
     */
    erase?: PersonalDataEraser;
}

/**
 * Work a module's {@link PersonalDataSection.erase} defers until the erasure transaction has
 * committed. Runs only on a commit, never on a rollback; a failure is logged by the caller and
 * never undoes an erasure that already happened.
 */
export type AfterErase = () => Promise<void>;

/**
 * One module's erase hook, resolved and ready to call inside a hard delete's transaction.
 * Resolves to its {@link AfterErase}, if it has one.
 */
export type PersonalDataEraser = (
    userId: string,
    session: ClientSession
) => Promise<AfterErase | undefined> | Promise<void>;

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
     * Runs once, right after {@link subscribe} — every enabled module is known by then, so a
     * module that needs a cross-module lookup (`locales`' `translatables`, `account`'s
     * `personalData` sections) can resolve it itself here instead of `app.ts` collecting it and
     * handing it in by name — `app.ts` no longer imports `locales`/`account` for this.
     *
     * Also where a module installs its own kernel port (an auth resolver, a translation port, a
     * locale override provider, an audit sink) — moving that call here from module-file import
     * time means importing this file no longer enables the port: only a module `registerModules`
     * is actually given runs its `onRegistered`.
     *
     * @param modules - every enabled module, in registration order
     */
    onRegistered?: (modules: readonly AppModule[]) => void;

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
     * Absolute path to this module's `templates/` directory, holding the EJS email/PDF templates
     * it owns — `orders`' order-confirm email, `invoicing`'s PDF, and so on (SK-15). Deleting the
     * module now deletes its templates with it; before this field they lived in `shared/templates`
     * regardless of which module rendered them, so `rm -rf` on a module left them behind with no
     * owner. `app.ts` passes these to `registerTemplateDirectories` before the first request that
     * could render one. `shared/templates/layouts` holds only include PARTIALS no template is
     * ever resolved BY NAME, so it is not collected here — every template reaches it directly, by
     * its own fixed path, the same way `shared/contracts` is reached by the bundler.
     */
    templates?: string;

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
     * This module's {@link PublicEventTarget}s, keyed by the domain event name each one projects
     * from — see {@link resolvePublicEvents}. Most modules have none; a module whose domain events
     * are also part of `webhooks`' public catalogue registers one entry per such event.
     */
    publicEvents?: Readonly<Record<string, PublicEventTarget>>;

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
     * This module's slices of the environment — what it reads, how each value is checked, and what
     * it cannot run without. Collected by {@link registerModules} (with every rate-limit budget in
     * {@link rateLimits}) into one boot gate that reports every mistake at once, so a typo is
     * refused at boot, never on the first request that reads it. Most modules that read a
     * variable declare one; deleting the module deletes its gate.
     *
     * See: docs/tools/configuration.md
     */
    config?: readonly ConfigSlice[];

    /**
     * The states this module GUARANTEES a named scenario offers, keyed by scenario name (currently
     * only `shop`). Each name resolves to one row id — pinned in `scenarios/subjects.ts` or
     * recorded by the flow runner — and `scenarios/check.ts` holds the two lists equal in both
     * directions. Declared here rather than only inside `scenarios/` so deleting a module deletes
     * its guarantees the same way deleting its own `authorization.yaml` deletes its permission
     * keys — see `scripts/contracts/authorization-bundle.ts`.
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
     * export (infrastructure, or a collection with no user-linked field) — a module's own
     * `personalData: 'none'` comment says why, at the point a reviewer can check it against the
     * model right beside it.
     */
    personalData: readonly PersonalDataSection[] | 'none';
}

/**
 * Entries from several modules, merged into one lookup — refusing a key two of them declare.
 * `Object.fromEntries` would keep the last silently, so one module's writeback or translatable
 * would quietly answer for another's.
 *
 * @param entries - every module's entries, in module order
 * @param label - what the key names, for the boot error
 * @throws {Error} when two entries share a key
 */
const uniqueEntries = <T>(entries: [string, T][], label: string): Record<string, T> => {
    const merged: Record<string, T> = {};
    for (const [key, value] of entries) {
        if (Object.hasOwn(merged, key))
            throw new Error(`Two modules declare the same ${label}: "${key}".`);
        merged[key] = value;
    }
    return merged;
};

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
 * @throws {Error} when two modules declare the same collection
 */
export const resolveImageTargets = (
    appModules: AppModule[]
    // `| undefined` stated explicitly: `noUncheckedIndexedAccess` is off project-wide, so without
    // this a lookup by an unregistered `collection` string would type-check as always present.
): Readonly<Record<string, ImageTarget | undefined>> =>
    uniqueEntries(
        appModules.flatMap((appModule) => Object.entries(appModule.imageTargets ?? {})),
        'image target collection'
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
 * cycle. `locales/module.ts`'s own `onRegistered` hook builds the lookup once every module is
 * known, the same way `app/workers.ts` builds `imageTargets`.
 *
 * @param appModules - the enabled module list
 * @throws {Error} when two modules declare the same entity type
 */
export const resolveTranslatables = (
    appModules: readonly AppModule[]
    // `| undefined` stated explicitly: `noUncheckedIndexedAccess` is off project-wide, so without
    // this a lookup by an unregistered `entityType` string would type-check as always present.
): Readonly<Record<string, TranslatableTarget | undefined>> =>
    uniqueEntries(
        appModules.flatMap((appModule) => Object.entries(appModule.translatables ?? {})),
        'translatable entity type'
    );

/**
 * Every registered module's {@link PublicEventTarget}s, flattened into one lookup keyed by domain
 * event name.
 *
 * Built from the passed-in list for the same reason {@link resolveImageTargets} is: this file must
 * stay free of any `src/modules/*` import, so `webhooks/module.ts`'s own `onRegistered` hook —
 * which needs exactly this lookup and may not import `orders`/`payments` directly — can depend on
 * `kernel/registry` without a cycle, the same pattern `locales/module.ts` follows for
 * `translatables`.
 *
 * @param appModules - the enabled module list
 * @throws {Error} when two modules declare a `publicEvents` entry for the same domain event
 */
export const resolvePublicEvents = (
    appModules: readonly AppModule[]
    // `| undefined` stated explicitly: `noUncheckedIndexedAccess` is off project-wide, so without
    // this a lookup by an unregistered domain event name would type-check as always present.
): Readonly<Record<string, PublicEventTarget | undefined>> =>
    uniqueEntries(
        appModules.flatMap((appModule) => Object.entries(appModule.publicEvents ?? {})),
        'public event domain name'
    );

/**
 * Every registered module's {@link PersonalDataSection}s, flattened in declaration order —
 * `'none'` contributes nothing.
 *
 * Built from the passed-in list for the same reason {@link resolveImageTargets} is: this file must
 * stay free of any `src/modules/*` import. `account/module.ts`'s own `onRegistered` hook builds
 * this once every module is known, the same way `locales/module.ts` builds its `translatables`
 * lookup — see `modules/account/services/personal-data-registry.ts`.
 *
 * @param appModules - the enabled module list
 */
export const resolvePersonalDataSections = (
    appModules: readonly AppModule[]
): readonly PersonalDataSection[] =>
    appModules.flatMap((appModule) =>
        appModule.personalData === 'none' ? [] : appModule.personalData
    );

/**
 * DDD-D6: every registered module's {@link PersonalDataSection.erase}, flattened — a section with
 * none contributes nothing, the same way `'none'` does for {@link resolvePersonalDataSections}.
 *
 * `users/module.ts`'s own `onRegistered` hook builds this once every module is known and hands it
 * to `users/services/remove.ts`'s hard-delete path, the same pattern `resolvePersonalDataSections` and
 * `account`'s registry follow — this file stays free of any `src/modules/*` import either way.
 *
 * @param appModules - the enabled module list
 */
export const resolvePersonalDataErasers = (
    appModules: readonly AppModule[]
): readonly PersonalDataEraser[] =>
    appModules.flatMap((appModule) =>
        appModule.personalData === 'none'
            ? []
            : appModule.personalData.flatMap((section) => (section.erase ? [section.erase] : []))
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
 * Let every module attach its domain-event handlers, then let every module run its
 * {@link AppModule.onRegistered} hook.
 *
 * Subscription is separated from mounting because a handler may fire for an event another module
 * emits while serving a request, so every subscription has to exist before the first route does.
 * `onRegistered` runs after every `subscribe`, for the same reason, plus one more: a module's own
 * `onRegistered` may itself rely on a sibling's event handler already being attached. Config is
 * asserted first, for the same "before the first route" reason.
 *
 * @param appModules - the enabled module list
 * @param appSlices - the configuration that belongs to no module — this file must stay free of any
 *   `src/app`/`src/modules/*` import, so the caller assembles it
 * @throws when {@link assertModuleConfig} refuses to boot
 */
export const registerModules = (
    appModules: AppModule[],
    appSlices: readonly ConfigSlice[] = []
): void => {
    assertModuleConfig(appModules, appSlices);
    for (const appModule of appModules) appModule.subscribe?.();
    for (const appModule of appModules) appModule.onRegistered?.(appModules);
    markDomainEventsWired();
};

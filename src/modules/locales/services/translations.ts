/**
 * @module
 * The translator's door: reading every locale an entity has, and writing a PATCH or PUT into it.
 * Generic across whatever `translatables` declares, and never writes the entity's own collection
 * except to stamp it edited: the entity's text IS the default language, so only the other
 * languages are rows here.
 */

import type { ClientSession } from 'mongoose';
import type {
    Translation,
    TranslationOrigin,
    TranslationSource,
    ReplaceEntityTranslationsRequest
} from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { canonicalLocale, getFallbackLocale, t } from '@infrastructure/i18n';
import type { TranslatableTarget } from '@kernel/registry';
import { fillOmittedWithNull, stripUndefined } from '@infrastructure/object-guards';
import type {
    TranslationBatch,
    TranslationWritePlan,
    TranslationWriteSlot
} from '@kernel/translation';
import {
    fieldError,
    generateReject,
    generateSuccess,
    type ResponseErrorItem,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { invalidateCacheTagsLogged } from '@infrastructure/adapters/cache';
import { carryVersion, rearmPrecondition } from '@infrastructure/persistence/versioning';
import { withTransaction } from '@infrastructure/runtime/database';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { localeAuditActions } from '../audit';
import { deriveSourceDigest, localeRepository, translationRepository } from '../repository';
import { translatableTarget } from './translatables';

/**
 * The GET/PUT/PATCH admin shape: `translations` is already wire-shaped, `translationRepository`'s
 * `TWire` — `normalize`'s own transform, not a document, so no controller calls `.toJSON()` on it.
 */
export interface EntityTranslationsResult {
    entityType: string;
    entityId: string;
    /** The entity's own text, in the default language: what every row is a copy of. */
    source: TranslationSource;
    translations: Translation[];
    /** Every field name the `translatables` registry declares for this `entityType`. */
    fields: readonly string[];
}

/** Every field name a target's `fieldRules` declares: the translatable fields, in rule order. */
const declaredFields = (target: TranslatableTarget): string[] =>
    Object.keys(target.fieldRules.shape);

/** An `entityType` the registry does not know: 404, like any path that names nothing. */
const entityTypeUnknown = (entityType: string): ResponseReject =>
    generateReject(404, [
        {
            code: ERROR_CODES.LOCALE_ENTITY_TYPE_UNKNOWN,
            message: t('locales.error-entity-type-unknown', { entityType })
        }
    ]);

/**
 * The 404 error item for an `entityId` the module named by `entityType` does not currently hold.
 * The controllers answer a malformed id with the same item, so nothing tells the two apart.
 *
 * @param entityType - the translatable's registry key
 * @param entityId - the id the URL named
 */
export const entityNotFoundError = (entityType: string, entityId: string): ResponseErrorItem => ({
    code: ERROR_CODES.LOCALE_ENTITY_NOT_FOUND,
    message: t('locales.error-entity-not-found', { entityType, entityId })
});

/** An `entityId` the module named by `entityType` does not currently hold. */
const entityNotFound = (entityType: string, entityId: string): ResponseReject =>
    generateReject(404, [entityNotFoundError(entityType, entityId)]);

/**
 * One `VALIDATION_ERROR` rejection for a single locale slot — the shape every {@link planSlot}
 * refusal shares, differing only in the message key, its interpolation params, and which
 * `details.field` path names the offending part of the payload.
 */
const slotRejection = (
    messageKey: string,
    parameters: Record<string, string> | undefined,
    field: string
): ResponseReject => generateReject(422, [fieldError(field, t(messageKey, parameters ?? {}))]);

/**
 * One locale slot's outcome, before any write happens — the whole batch validates before anything
 * writes, so a rejected slot never leaves a partial edit behind.
 */
type PlannedWrite =
    | {
          locale: string;
          kind: 'upsert';
          fields: Record<string, string | null>;
          origin: TranslationOrigin;
      }
    | { locale: string; kind: 'delete' };

/**
 * One locale's entry in either write body — a PUT's strings, or a PATCH's strings and `null`s.
 * `origin` is optional here because internal callers (a product write) leave it out; the PATCH
 * contract itself requires it, so only a PUT or an internal batch ever reaches `?? 'human'`.
 */
type LocaleWrite = TranslationBatch[string];

/**
 * Validate one locale slot against the `locales` collection, the registry's declared fields, and
 * the default-language refusal. Returns the planned write, or the rejection.
 */
const planSlot = (
    entityType: string,
    target: TranslatableTarget,
    fallbackLocale: string,
    locale: string,
    value: LocaleWrite
): Promise<PlannedWrite | ResponseReject> => {
    /**
     * The default language is the entity's own text, written through the entity's own door: a row
     * for it, or a delete of one, has no meaning here. `null` included, so nothing can "delete" it.
     */
    if (locale === fallbackLocale)
        return Promise.resolve(
            slotRejection('translation.error-default-language', { locale }, locale)
        );

    if (value === null) return Promise.resolve({ locale, kind: 'delete' });

    const planFields = (): PlannedWrite | ResponseReject => {
        if (Object.keys(value.fields).length === 0)
            return slotRejection('locales.error-translation-fields-empty', undefined, locale);

        const unknownField = Object.keys(value.fields).find(
            (field) => !declaredFields(target).includes(field)
        );
        if (unknownField !== undefined)
            return slotRejection(
                'locales.error-translation-field-unknown',
                { field: unknownField, entityType },
                `${locale}.${unknownField}`
            );

        /**
         * The entity's own rules for a value, parsed (so trimmed too): this door cannot land what
         * the entity's own write door would refuse. The unknown-field check above runs first, so
         * strict mode's root-level `unrecognized_keys` issue (empty path) never reaches here.
         */
        const parsed = target.fieldRules.safeParse(value.fields);
        if (!parsed.success) {
            const [issue] = parsed.error.issues;
            return generateReject(422, [
                fieldError(`${locale}.${String(issue.path[0])}`, issue.message)
            ]);
        }

        /**
         * `.optional()` rules type an omitted field as `undefined`; zod omits the key in practice,
         * and `stripUndefined` makes it certain, which narrows the type the compiler cannot.
         */
        const fields = stripUndefined(parsed.data) as Record<string, string | null>;
        return { locale, kind: 'upsert', fields, origin: value.origin ?? 'human' };
    };

    return localeRepository.findByTag(locale).then((language) => {
        if (!language)
            return slotRejection('locales.error-translation-locale-unknown', { locale }, locale);

        /**
         * An inactive language is writable on purpose: that is where a translation is drafted.
         * The read paths drop its rows until the language goes live (`inactiveTags`).
         */
        return planFields();
    });
};

/** `true` for a rejection, narrowing a union of it and a plan/slot shape — neither of which carries `success`. */
const isRejection = (value: unknown): value is ResponseReject =>
    typeof value === 'object' && value !== null && 'success' in value && !value.success;

/**
 * The body with every locale key in its canonical spelling, so `EN` is the fallback `en` and
 * `pt-br` the stored `pt-BR` wherever a key is compared (RFC 4647: tags compare case-blind).
 *
 * @param payload - a PUT or PATCH body, or a port caller's batch, keyed by locale
 */
const withCanonicalKeys = <TValue>(payload: Record<string, TValue>): Record<string, TValue> =>
    Object.fromEntries(
        Object.entries(payload).map(([locale, value]) => [canonicalLocale(locale), value])
    );

/**
 * Validate a whole batch — the same `ReplaceEntityTranslationsRequest` shape PUT and PATCH both send —
 * against the `locales` collection, the registry's declared fields, and the default-language
 * refusal: the pre-flight half of a write, with no entity id at all. Every check here is about the
 * LOCALE and the FIELD NAMES, never about a specific row, so this runs the same whether the entity
 * already exists or is still being created in the same request (`productService.create`'s
 * `POST /products`, notably).
 *
 * Returns the resolved `target` alongside the plan, so a caller that needs it afterwards — its
 * cache tag, its collection — looks it up here once rather than repeating the same
 * {@link translatableTarget} call itself.
 *
 * @returns the plan, or the first rejection encountered
 */
const planTranslationWrites = async (
    entityType: string,
    payload: Record<string, LocaleWrite>
): Promise<ResponseReject | { target: TranslatableTarget; planned: PlannedWrite[] }> => {
    const target = translatableTarget(entityType);
    if (!target) return entityTypeUnknown(entityType);

    const fallbackLocale = getFallbackLocale();
    const planned: PlannedWrite[] = [];

    for (const [locale, value] of Object.entries(withCanonicalKeys(payload))) {
        const result = await planSlot(entityType, target, fallbackLocale, locale, value);
        if (isRejection(result)) return result;
        planned.push(result);
    }

    return { target, planned };
};

/**
 * Apply an ALREADY-VALIDATED plan — see {@link planTranslationWrites} — without touching the
 * entity's cache tag or its audit trail: a caller with its own document to write
 * (`productService.create`/`updateById`) owns both itself, in the same operation that calls this.
 * `updateEntityTranslations` below is the generic door's own caller, and still owns that pair for
 * itself.
 *
 * A row whose own text changes (or is new) is stamped with the digest of the entity's text AS IT
 * STANDS NOW; a row re-sent unchanged keeps its stored digest, so it stays `outdated` until
 * someone actually changes it. A caller writing its own document in the same transaction
 * (`productService.create`/`updateById`) writes that first, so the digest is the one of the text the
 * translator saw saved — read from the record, never from a row that may not be written yet.
 *
 * Never validates. A caller that skips {@link planTranslationWrites} first can corrupt data.
 *
 * @param session - joins every write to the caller's transaction; omitted, each stands alone
 */
const writePlannedTranslations = async (
    entityType: string,
    entityId: string,
    planned: readonly PlannedWrite[],
    translatedBy: string | undefined,
    session?: ClientSession
): Promise<void> => {
    const target = translatableTarget(entityType);
    const source = target
        ? await target.sourceOf(entityId, declaredFields(target), session)
        : undefined;
    const sourceDigest = source ? deriveSourceDigest(source) : undefined;

    for (const slot of planned) {
        if (slot.kind === 'delete') {
            await translationRepository.removeEntityLocale(
                entityType,
                entityId,
                slot.locale,
                session
            );
            continue;
        }

        /**
         * A row whose own text this write leaves as it is keeps the digest it had: a form sends
         * every open tab, and re-sending an untouched translation is not a review of it.
         */
        const stored = await translationRepository.findEntityLocale(
            entityType,
            entityId,
            slot.locale,
            session
        );
        const textUnchanged =
            stored !== null &&
            Object.entries(slot.fields).every(([name, value]) =>
                value === null ? !(name in stored.fields) : stored.fields[name] === value
            );

        await translationRepository.upsertEntityLocale(
            entityType,
            entityId,
            slot.locale,
            slot.fields,
            slot.origin,
            translatedBy,
            textUnchanged ? stored.sourceDigest : sourceDigest,
            session
        );
    }
};

/**
 * {@link planTranslationWrites}, shaped for the `@kernel/translation` port — which cannot import
 * this module's own `PlannedWrite` (the wall `kernel/translation.ts`'s header names), so its
 * `plan` capability is typed against `TranslationWriteSlot` instead: the same shape, minus
 * `origin`, which a caller writing its own document alongside the translations
 * (`productService.create`/`updateById`) has no use for.
 */
export const planForPort = (
    entityType: string,
    payload: Record<string, LocaleWrite>
): Promise<TranslationWritePlan | ResponseReject> =>
    planTranslationWrites(entityType, payload).then((plan) =>
        isRejection(plan)
            ? plan
            : {
                  planned: plan.planned.map((slot): TranslationWriteSlot =>
                      slot.kind === 'upsert'
                          ? { locale: slot.locale, kind: 'upsert', fields: slot.fields }
                          : slot
                  )
              }
    );

/**
 * {@link writePlannedTranslations}, shaped for the port — `origin` defaults to `human` for every
 * upsert, since the port's callers are editors and translators, never a machine import.
 */
export const writeForPort = (
    entityType: string,
    entityId: string,
    writePlan: TranslationWritePlan,
    translatedBy: string | undefined,
    session?: ClientSession
): Promise<void> =>
    writePlannedTranslations(
        entityType,
        entityId,
        writePlan.planned.map((slot): PlannedWrite =>
            slot.kind === 'upsert'
                ? { locale: slot.locale, kind: 'upsert', fields: slot.fields, origin: 'human' }
                : slot
        ),
        translatedBy,
        session
    );

/**
 * Validate and apply a batch — shared by `updateEntityTranslations` (PATCH) and
 * `replaceEntityTranslations` (PUT), which differ only in what `payload` already contains by the
 * time it gets here: PATCH's payload is the caller's body verbatim, PUT's has an explicit `null`
 * added for every stored locale the caller's body left out.
 *
 * Answers the contract's 404 when `target.exists` says the entity is gone — checked AFTER the
 * batch validates but BEFORE anything writes, so neither a missing entity nor a malformed id ever
 * leaves an orphan translation row behind.
 *
 * @param context - caller context for the `ADMIN_TRANSLATION_UPDATED` audit emit and
 *   `translatedBy`; omitted by tests that call this as a plain helper — no context means no emit
 */
const applyTranslationBatch = async (
    entityType: string,
    entityId: string,
    payload: Record<string, LocaleWrite>,
    context?: CallerContext
): Promise<ResponseSuccess<EntityTranslationsResult> | ResponseReject> => {
    const plan = await planTranslationWrites(entityType, payload);
    if (isRejection(plan)) return plan;
    const { target, planned } = plan;

    /**
     * Checked before any write: a missing (or malformed) entity id must never leave orphan
     * translation rows behind for a document that was never there to translate.
     */
    if ((await target.revisionOf(entityId)) === undefined)
        return entityNotFound(entityType, entityId);

    const translatedBy = context?.caller.id ?? undefined;
    /**
     * One transaction: the document's tag and the rows. Rows outside the document changed, so its
     * tag must move with them, and no `PUT` carrying the still-valid tag may land between the writes.
     */
    await withTransaction(async (session) => {
        /**
         * The driver re-runs this callback on a transient conflict; each run must compare the
         * caller's `If-Match` again, or the retry would write unchecked over the conflicting edit.
         */
        rearmPrecondition();
        /**
         * First, so a stale `If-Match` is refused (412) before any row is written. The fence is
         * the OWNER's counter: a translation save and a product edit refuse each other on purpose.
         */
        await target.markEdited(entityId, session);
        await writePlannedTranslations(entityType, entityId, planned, translatedBy, session);
    });

    await invalidateCacheTagsLogged([target.cacheTag]);

    recordAudit(context, {
        action: localeAuditActions.ADMIN_TRANSLATION_UPDATED,
        outcome: 'success',
        targetType: entityType,
        targetId: entityId,
        metadata: {
            upserted: planned.filter((slot) => slot.kind === 'upsert').map((s) => s.locale),
            deleted: planned.filter((slot) => slot.kind === 'delete').map((s) => s.locale)
        }
    });

    return getEntityTranslations(entityType, entityId);
};

/**
 * Merge a PATCH into an entity's translations (RFC 7396): a locale that is an object merges field
 * by field into its row, one that is `null` is deleted, one that is absent is left alone.
 */
export const updateEntityTranslations = (
    entityType: string,
    entityId: string,
    payload: TranslationBatch,
    context?: CallerContext
): Promise<ResponseSuccess<EntityTranslationsResult> | ResponseReject> =>
    applyTranslationBatch(entityType, entityId, payload, context);

/**
 * A PUT states each locale WHOLE, so a declared field its `fields` leaves out is cleared — turned
 * into the explicit `null` a PATCH would have sent, which is all the write side understands. An
 * EMPTY `fields` is left as it is, for {@link planSlot} to refuse: clearing everything is a
 * delete, and a delete is the locale's own `null`.
 *
 * @param payload - the PUT body
 * @param declared - every field name the entity's registry entry declares
 * @returns the body with each non-empty locale carrying every declared field
 */
const clearOmittedInPayload = (
    payload: ReplaceEntityTranslationsRequest,
    declared: readonly string[]
): Record<string, LocaleWrite> =>
    Object.fromEntries(
        Object.entries(payload).map(([locale, entry]): [string, LocaleWrite] => [
            locale,
            entry === null || Object.keys(entry.fields).length === 0
                ? entry
                : { ...entry, fields: fillOmittedWithNull(entry.fields, declared) }
        ])
    );

/**
 * Replace the whole set for a PUT: every locale currently stored but absent from the body is
 * deleted, by turning "absent" into an explicit `null` before handing the batch to
 * {@link applyTranslationBatch} — the same validation `updateEntityTranslations` already runs
 * then treats a planned `null` as a delete. The default language is never among the stored
 * locales ({@link translationRepository}'s reads leave a stray row in it out), so a PUT can
 * neither delete nor require it.
 */
export const replaceEntityTranslations = async (
    entityType: string,
    entityId: string,
    payload: ReplaceEntityTranslationsRequest,
    context?: CallerContext
): Promise<ResponseSuccess<EntityTranslationsResult> | ResponseReject> => {
    const target = translatableTarget(entityType);
    if (!target) return entityTypeUnknown(entityType);

    const canonicalPayload = withCanonicalKeys(payload);
    const existing = await translationRepository.findEntityTranslations(entityType, entityId);

    const deletions = Object.fromEntries(
        existing
            .map((row) => row.locale)
            .filter((locale) => !(locale in canonicalPayload))
            .map((locale) => [locale, null])
    );

    return applyTranslationBatch(
        entityType,
        entityId,
        { ...clearOmittedInPayload(canonicalPayload, declaredFields(target)), ...deletions },
        context
    );
};

/**
 * Every language but the default an entity has a row for, beside the entity's own text, in the
 * admin shape. A row is `outdated` when it was written from a text that is not the entity's
 * current one (Shopify's `Translation.outdated`).
 */
export const getEntityTranslations = (
    entityType: string,
    entityId: string
): Promise<ResponseSuccess<EntityTranslationsResult> | ResponseReject> => {
    const target = translatableTarget(entityType);
    if (!target) return Promise.resolve(entityTypeUnknown(entityType));

    return Promise.all([
        target.revisionOf(entityId),
        target.sourceOf(entityId, declaredFields(target)),
        translationRepository.findEntityTranslations(entityType, entityId)
    ]).then(([revision, sourceFields, rows]) => {
        // Both answer `undefined` for a document that is not there (or an id that is no id).
        if (revision === undefined || sourceFields === undefined)
            return entityNotFound(entityType, entityId);
        const source = { fields: sourceFields, digest: deriveSourceDigest(sourceFields) };
        // The owner's counter rides beside the result, so the `ETag` can be derived from it.
        return generateSuccess(
            carryVersion(
                { editRevision: revision },
                {
                    entityType,
                    entityId,
                    source,
                    translations: translationRepository
                        .normalize(rows)
                        .map((row) => ({ ...row, outdated: row.sourceDigest !== source.digest })),
                    fields: declaredFields(target)
                }
            )
        );
    });
};

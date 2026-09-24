/**
 * @module
 * The translator's door: reading every locale an entity has, and merging a PATCH into it. Generic
 * across whatever `translatables` declares — `product` in V1 — and never reaches the entity's own
 * collection except through the derived-index-column write the registry names.
 */

import type {
    Translation,
    TranslationFields,
    TranslationOrigin,
    UpsertTranslationsRequest
} from '@types';
import { getFallbackLocale, t } from '@infrastructure/i18n';
import type { TranslatableTarget } from '@kernel/registry';
import type { TranslationWritePlan, TranslationWriteSlot } from '@kernel/translation';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { invalidateCacheTagsLogged } from '@infrastructure/adapters/cache';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { localeAuditActions } from '../audit';
import { deriveSourceDigest, localeRepository, translationRepository } from '../repository';
import { translatableTarget } from './translatables';

/**
 * The GET/PATCH admin shape: `translations` is already wire-shaped, `translationRepository`'s
 * `TWire` — `normalize`'s own transform, not a document, so no controller calls `.toJSON()` on it.
 */
export interface EntityTranslationsResult {
    entityType: string;
    entityId: string;
    translations: Translation[];
    /** Every field name the `translatables` registry declares for this `entityType`. */
    fields: readonly string[];
}

/** An `entityType` the `translatables` registry does not know. */
const entityTypeUnknown = (entityType: string): ResponseReject =>
    generateReject(422, [t('locales.error-entity-type-unknown', { entityType })]);

/**
 * One `VALIDATION_ERROR` rejection for a single locale slot — the shape every {@link planSlot}
 * refusal shares, differing only in the message key, its interpolation params, and which
 * `details.field` path names the offending part of the payload.
 */
const slotRejection = (
    messageKey: string,
    parameters: Record<string, string> | undefined,
    field: string
): ResponseReject =>
    generateReject(422, [
        {
            code: 'VALIDATION_ERROR',
            message: t(messageKey, parameters),
            details: { field }
        }
    ]);

/**
 * One locale slot's outcome, before any write happens — the whole batch validates before anything
 * writes, so a rejected slot never leaves a partial edit behind.
 */
type PlannedWrite =
    | { locale: string; kind: 'upsert'; fields: TranslationFields; origin: TranslationOrigin }
    | { locale: string; kind: 'delete' };

/**
 * Validate one locale slot against the `locales` collection, the registry's declared fields, and
 * the fallback-locale delete guard. Returns the planned write, or the rejection.
 */
const planSlot = (
    entityType: string,
    fields: readonly string[],
    fallbackLocale: string,
    locale: string,
    value: UpsertTranslationsRequest[string]
): Promise<PlannedWrite | ResponseReject> => {
    if (value === null) {
        if (locale === fallbackLocale)
            return Promise.resolve(
                slotRejection('locales.error-translation-fallback-required', { locale }, locale)
            );
        return Promise.resolve({ locale, kind: 'delete' });
    }

    return localeRepository.findByTag(locale).then((language) => {
        if (!language)
            return slotRejection('locales.error-translation-locale-unknown', { locale }, locale);
        if (!language.active)
            return slotRejection('locales.error-translation-locale-inactive', { locale }, locale);

        if (Object.keys(value.fields).length === 0)
            return slotRejection('locales.error-translation-fields-empty', undefined, locale);

        const unknownField = Object.keys(value.fields).find((field) => !fields.includes(field));
        if (unknownField !== undefined)
            return slotRejection(
                'locales.error-translation-field-unknown',
                { field: unknownField, entityType },
                `${locale}.${unknownField}`
            );

        return { locale, kind: 'upsert', fields: value.fields, origin: value.origin ?? 'human' };
    });
};

/** `true` for a rejection, narrowing a union of it and a plan/slot shape — neither of which carries `success`. */
const isRejection = (value: unknown): value is ResponseReject =>
    typeof value === 'object' && value !== null && 'success' in value && !value.success;

/**
 * Validate a whole PATCH-shaped batch against the `locales` collection, the registry's declared
 * fields, and the fallback-locale delete guard — the pre-flight half of a write, with no entity id
 * at all: every check here is about the LOCALE and the FIELD NAMES, never about a specific row, so
 * this runs the same whether the entity already exists or is still being created in the same
 * request (`productService.write`'s `POST /products`, notably).
 *
 * Returns the resolved `target` alongside the plan, so a caller that needs it afterwards — its
 * cache tag, its collection — looks it up here once rather than repeating the same
 * {@link translatableTarget} call itself.
 *
 * @returns the plan, or the first rejection encountered
 */
const planTranslationWrites = async (
    entityType: string,
    payload: UpsertTranslationsRequest
): Promise<
    | { target: TranslatableTarget; fallbackLocale: string; planned: PlannedWrite[] }
    | ResponseReject
> => {
    const target = translatableTarget(entityType);
    if (!target) return entityTypeUnknown(entityType);

    const fallbackLocale = getFallbackLocale();
    const planned: PlannedWrite[] = [];

    for (const [locale, value] of Object.entries(payload)) {
        const result = await planSlot(entityType, target.fields, fallbackLocale, locale, value);
        if (isRejection(result)) return result;
        planned.push(result);
    }

    return { target, fallbackLocale, planned };
};

/**
 * Apply an ALREADY-VALIDATED plan — see {@link planTranslationWrites} — without touching the
 * entity's cache tag or its audit trail: a caller with its own document to write
 * (`productService.write`) owns both itself, in the same operation that calls this.
 * `upsertEntityTranslations` below is the generic door's own caller, and still owns that pair for
 * itself.
 *
 * The derived index column IS written here, not left to each caller: it is the one invariant that
 * cannot vary by door — `title`/`description` on a translatable entity's own document must always
 * reflect its fallback-locale row, in every caller, so there is exactly one place deciding when
 * that write happens rather than one per caller that could drift.
 *
 * Never validates. A caller that skips {@link planTranslationWrites} first can corrupt data.
 */
const writePlannedTranslations = async (
    entityType: string,
    entityId: string,
    fallbackLocale: string,
    planned: readonly PlannedWrite[],
    translatedBy: string | undefined
): Promise<void> => {
    const fallbackRow = await translationRepository.findEntityLocale(
        entityType,
        entityId,
        fallbackLocale
    );
    const fallbackDigest = fallbackRow ? deriveSourceDigest(fallbackRow.fields) : undefined;

    for (const slot of planned) {
        if (slot.kind === 'delete') {
            await translationRepository.removeEntityLocale(entityType, entityId, slot.locale);
            continue;
        }

        await translationRepository.upsertEntityLocale(
            entityType,
            entityId,
            slot.locale,
            slot.fields,
            slot.origin,
            translatedBy,
            slot.locale === fallbackLocale ? undefined : fallbackDigest
        );
    }

    const fallbackWrite = planned.find(
        (slot): slot is Extract<PlannedWrite, { kind: 'upsert' }> =>
            slot.kind === 'upsert' && slot.locale === fallbackLocale
    );
    const target = translatableTarget(entityType);
    if (fallbackWrite && target)
        await translationRepository.updateDerivedColumn(
            target.collection,
            entityId,
            fallbackWrite.fields
        );
};

/**
 * {@link planTranslationWrites}, shaped for the `@kernel/translation` port — which cannot import
 * this module's own `PlannedWrite` (the wall `kernel/translation.ts`'s header names), so its
 * `plan` capability is typed against `TranslationWriteSlot` instead: the same shape, minus
 * `origin`, which a caller writing its own document alongside the translations
 * (`productService.write`) has no use for.
 */
export const planForPort = (
    entityType: string,
    payload: UpsertTranslationsRequest
): Promise<TranslationWritePlan | ResponseReject> =>
    planTranslationWrites(entityType, payload).then((plan) =>
        isRejection(plan)
            ? plan
            : {
                  fallbackLocale: plan.fallbackLocale,
                  planned: plan.planned.map(
                      (slot): TranslationWriteSlot =>
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
    translatedBy: string | undefined
): Promise<void> =>
    writePlannedTranslations(
        entityType,
        entityId,
        writePlan.fallbackLocale,
        writePlan.planned.map(
            (slot): PlannedWrite =>
                slot.kind === 'upsert'
                    ? { locale: slot.locale, kind: 'upsert', fields: slot.fields, origin: 'human' }
                    : slot
        ),
        translatedBy
    );

/**
 * Merge a PATCH into an entity's translations: upsert what is an object, delete what is `null`,
 * leave alone what is absent.
 *
 * @param context - caller context for the `ADMIN_TRANSLATION_UPDATED` audit emit and
 *   `translatedBy`; omitted by tests that call this as a plain helper — no context means no emit
 */
export const upsertEntityTranslations = async (
    entityType: string,
    entityId: string,
    payload: UpsertTranslationsRequest,
    context?: CallerContext
): Promise<ResponseSuccess<EntityTranslationsResult> | ResponseReject> => {
    const plan = await planTranslationWrites(entityType, payload);
    if (isRejection(plan)) return plan;
    const { target, fallbackLocale, planned } = plan;

    const translatedBy = context?.caller.id ?? undefined;
    // Writes the rows AND the derived index column — see `writePlannedTranslations`'s docblock.
    await writePlannedTranslations(entityType, entityId, fallbackLocale, planned, translatedBy);

    await invalidateCacheTagsLogged([target.cacheTag]);

    recordAudit(context, {
        action: localeAuditActions.ADMIN_TRANSLATION_UPDATED,
        outcome: 'success',
        target_type: entityType,
        target_id: entityId,
        metadata: {
            upserted: planned.filter((slot) => slot.kind === 'upsert').map((s) => s.locale),
            deleted: planned.filter((slot) => slot.kind === 'delete').map((s) => s.locale)
        }
    });

    return getEntityTranslations(entityType, entityId);
};

/** Every locale row an entity has, in the admin shape. */
export const getEntityTranslations = (
    entityType: string,
    entityId: string
): Promise<ResponseSuccess<EntityTranslationsResult> | ResponseReject> => {
    const target = translatableTarget(entityType);
    if (!target) return Promise.resolve(entityTypeUnknown(entityType));

    return translationRepository.findEntityTranslations(entityType, entityId).then((rows) =>
        generateSuccess({
            entityType,
            entityId,
            translations: translationRepository.normalize(rows),
            fields: target.fields
        })
    );
};

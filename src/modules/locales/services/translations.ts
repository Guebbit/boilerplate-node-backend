/**
 * @module
 * The translator's door: reading every locale an entity has, and merging a PATCH into it. Generic
 * across whatever `translatables` declares — `product` in V1 — and never reaches the entity's own
 * collection except through the derived-index-column write the registry names.
 */

import type { TranslationFields, TranslationOrigin, UpsertTranslationsRequest } from '@types';
import {
    getFallbackLocale,
    t,
    type TranslationWritePlan,
    type TranslationWriteSlot
} from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { invalidateCacheTagsLogged } from '@infrastructure/http/middlewares/cache';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { localeAuditActions } from '../audit';
import type { TranslationDocument } from '../model';
import { deriveSourceDigest, localeRepository, translationRepository } from '../repository';
import { translatableTarget } from './translatables';

/**
 * The GET/PATCH admin shape, still document-typed — `.toJSON()` per row is the controller's job,
 * the same boundary `createEntry`/`updateEntry` in `./entries.ts` draw.
 */
export interface EntityTranslationsResult {
    entityType: string;
    entityId: string;
    translations: TranslationDocument[];
}

/** An `entityType` the `translatables` registry does not know. */
const entityTypeUnknown = (entityType: string): ResponseReject =>
    generateReject(422, [t('locales.error-entity-type-unknown', { entityType })]);

/**
 * One locale slot's outcome, before any write happens — the whole batch validates before anything
 * writes, so a rejected slot never leaves a partial edit behind.
 */
export type PlannedWrite =
    | { locale: string; kind: 'upsert'; fields: TranslationFields; origin: TranslationOrigin }
    | { locale: string; kind: 'delete' };

/**
 * Validate one locale slot against the `locales` collection, the registry's declared fields, and
 * the fallback-locale delete guard. Returns the planned write, or the rejection.
 */
const planSlot = async (
    entityType: string,
    fields: readonly string[],
    fallbackLocale: string,
    locale: string,
    value: UpsertTranslationsRequest[string]
): Promise<PlannedWrite | ResponseReject> => {
    if (value === null) {
        if (locale === fallbackLocale)
            return generateReject(422, [
                {
                    code: 'VALIDATION_ERROR',
                    message: t('locales.error-translation-fallback-required', { locale }),
                    details: { field: locale }
                }
            ]);
        return { locale, kind: 'delete' };
    }

    const language = await localeRepository.findByTag(locale);
    if (!language)
        return generateReject(422, [
            {
                code: 'VALIDATION_ERROR',
                message: t('locales.error-translation-locale-unknown', { locale }),
                details: { field: locale }
            }
        ]);
    if (!language.active)
        return generateReject(422, [
            {
                code: 'VALIDATION_ERROR',
                message: t('locales.error-translation-locale-inactive', { locale }),
                details: { field: locale }
            }
        ]);

    if (Object.keys(value.fields).length === 0)
        return generateReject(422, [
            {
                code: 'VALIDATION_ERROR',
                message: t('locales.error-translation-fields-empty'),
                details: { field: locale }
            }
        ]);

    const unknownField = Object.keys(value.fields).find((field) => !fields.includes(field));
    if (unknownField !== undefined)
        return generateReject(422, [
            {
                code: 'VALIDATION_ERROR',
                message: t('locales.error-translation-field-unknown', {
                    field: unknownField,
                    entityType
                }),
                details: { field: `${locale}.${unknownField}` }
            }
        ]);

    return { locale, kind: 'upsert', fields: value.fields, origin: value.origin ?? 'human' };
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
 * @returns the plan, or the first rejection encountered
 */
export const planTranslationWrites = async (
    entityType: string,
    payload: UpsertTranslationsRequest
): Promise<{ fallbackLocale: string; planned: PlannedWrite[] } | ResponseReject> => {
    const target = translatableTarget(entityType);
    if (!target) return entityTypeUnknown(entityType);

    const fallbackLocale = getFallbackLocale();
    const planned: PlannedWrite[] = [];

    for (const [locale, value] of Object.entries(payload)) {
        const result = await planSlot(entityType, target.fields, fallbackLocale, locale, value);
        if (isRejection(result)) return result;
        planned.push(result);
    }

    return { fallbackLocale, planned };
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
export const writePlannedTranslations = async (
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
 * {@link planTranslationWrites}, shaped for the `@infrastructure/i18n` port — which cannot import
 * this module's own `PlannedWrite` (the wall `translation.ts`'s header names), so its `plan`
 * capability is typed against `TranslationWriteSlot` instead: the same shape, minus `origin`,
 * which a caller writing its own document alongside the translations (`productService.write`) has
 * no use for.
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

/** Every locale row an entity has, in the admin shape. */
export const getEntityTranslations = async (
    entityType: string,
    entityId: string
): Promise<ResponseSuccess<EntityTranslationsResult> | ResponseReject> => {
    if (!translatableTarget(entityType)) return entityTypeUnknown(entityType);

    const rows = await translationRepository.findEntityTranslations(entityType, entityId);

    return generateSuccess({
        entityType,
        entityId,
        translations: translationRepository.normalize(rows)
    });
};

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
    const target = translatableTarget(entityType);
    if (!target) return entityTypeUnknown(entityType);

    const plan = await planTranslationWrites(entityType, payload);
    if (isRejection(plan)) return plan;
    const { fallbackLocale, planned } = plan;

    const translatedBy = context?.caller.id ?? undefined;
    // Writes the rows AND the derived index column — see `writePlannedTranslations`'s docblock.
    await writePlannedTranslations(entityType, entityId, fallbackLocale, planned, translatedBy);

    await invalidateCacheTagsLogged([target.cacheTag]);

    if (context)
        emitAuditEvent(
            buildAuditEvent(context, {
                action: localeAuditActions.ADMIN_TRANSLATION_UPDATED,
                outcome: 'success',
                target_type: entityType,
                target_id: entityId,
                metadata: {
                    upserted: planned.filter((slot) => slot.kind === 'upsert').map((s) => s.locale),
                    deleted: planned.filter((slot) => slot.kind === 'delete').map((s) => s.locale)
                }
            })
        );

    const rows = await translationRepository.findEntityTranslations(entityType, entityId);

    return generateSuccess({
        entityType,
        entityId,
        translations: translationRepository.normalize(rows)
    });
};

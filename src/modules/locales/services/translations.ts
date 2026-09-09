/**
 * @module
 * The translator's door: reading every locale an entity has, and merging a PATCH into it. Generic
 * across whatever `translatables` declares — `product` in V1 — and never reaches the entity's own
 * collection except through the derived-index-column write the registry names.
 */

import type { TranslationFields, TranslationOrigin, UpsertTranslationsRequest } from '@types';
import { getFallbackLocale, t } from '@infrastructure/i18n';
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
type PlannedWrite =
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
                t('locales.error-translation-fallback-required', { locale })
            ]);
        return { locale, kind: 'delete' };
    }

    const language = await localeRepository.findByTag(locale);
    if (!language)
        return generateReject(422, [t('locales.error-translation-locale-unknown', { locale })]);
    if (!language.active)
        return generateReject(422, [t('locales.error-translation-locale-inactive', { locale })]);

    if (Object.keys(value.fields).length === 0)
        return generateReject(422, [t('locales.error-translation-fields-empty')]);

    const unknownField = Object.keys(value.fields).find((field) => !fields.includes(field));
    if (unknownField !== undefined)
        return generateReject(422, [
            t('locales.error-translation-field-unknown', { field: unknownField, entityType })
        ]);

    return { locale, kind: 'upsert', fields: value.fields, origin: value.origin ?? 'human' };
};

/** `true` for a rejection, narrowing a `PlannedWrite | ResponseReject` union. */
const isRejection = (value: PlannedWrite | ResponseReject): value is ResponseReject =>
    'success' in value && !value.success;

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

    const fallbackLocale = getFallbackLocale();

    // The whole batch validates before anything writes — a rejected slot must never leave a
    // partial edit behind, the same guarantee `services/entries.ts`'s bulk import gives.
    const planned: PlannedWrite[] = [];
    for (const [locale, value] of Object.entries(payload)) {
        const result = await planSlot(entityType, target.fields, fallbackLocale, locale, value);
        if (isRejection(result)) return result;
        planned.push(result);
    }

    /*
     * Read once, before any write in this batch: a non-fallback row's digest is stamped against
     * the fallback's CURRENT content and never touched again until that row is itself rewritten.
     * Sibling rows are never re-stamped when the fallback changes — an edit to the source stays
     * O(1) rather than O(languages), and a stale digest elsewhere is the intended signal, not a
     * bug to chase.
     */
    const fallbackRow = await translationRepository.findEntityLocale(
        entityType,
        entityId,
        fallbackLocale
    );
    const fallbackDigest = fallbackRow ? deriveSourceDigest(fallbackRow.fields) : undefined;

    const translatedBy = context?.caller.id ?? undefined;

    for (const slot of planned) {
        if (slot.kind === 'delete') {
            await translationRepository.removeEntityLocale(entityType, entityId, slot.locale);
            continue;
        }

        const isFallback = slot.locale === fallbackLocale;
        await translationRepository.upsertEntityLocale(
            entityType,
            entityId,
            slot.locale,
            slot.fields,
            slot.origin,
            translatedBy,
            isFallback ? undefined : fallbackDigest
        );

        if (isFallback)
            await translationRepository.updateDerivedColumn(
                target.collection,
                entityId,
                slot.fields
            );
    }

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

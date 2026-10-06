/**
 * @module
 * The multilingual write door: a product and its translation rows in one operation.
 */

import type { z } from 'zod';
import { getFallbackLocale } from '@infrastructure/i18n';
import {
    clearOmittedFields,
    isTranslationPlan,
    planTranslations,
    readAllTranslations,
    writeTranslations
} from '@kernel/translation';
import type { TranslationBatch } from '@kernel/translation';
import type {
    CallerContext,
    ProductTranslationFieldsPatch,
    ProductTranslationFieldsWrite
} from '@types';
import {
    generateSuccess,
    generateReject,
    type ResponseReject,
    type ResponseSuccess,
    validationErrors
} from '@infrastructure/http/response';
import { zodProductCreateSchema, zodProductUpdateSchema } from '../model';
import type { ProductDocument } from '../model';
import { withTransaction } from '@infrastructure/runtime/database';
import { finishCreate, finishUpdateById, insertProduct, updateByIdInTransaction } from './crud';

/**
 * `ProductTranslationsWrite` (this module's own flat write shape, `{ title, description? } | null`
 * per locale) wrapped for the `kernel/translation.ts` port, which speaks the generic door's
 * `TranslationBatch` — one locale's `{ fields, origin? }` rather than the flat shape this
 * module's own contract uses. `origin` is left to the port's own default (`human`): an editor's
 * write through `/products/{id}` is never a machine import.
 */
const toUpsertTranslationsRequest = (
    translations: Record<string, ProductTranslationFieldsPatch | null>
): TranslationBatch =>
    Object.fromEntries(
        Object.entries(translations).map(([locale, entry]) => [
            locale,
            entry === null
                ? null
                : {
                      fields: {
                          ...(entry.title === undefined ? {} : { title: entry.title }),
                          ...(entry.description === undefined
                              ? {}
                              : { description: entry.description })
                      }
                  }
        ])
    );

/**
 * A translations-plan rejection, reshaped for THIS module's write body — `translations` is a
 * nested field here, unlike the generic translator's door (an unwrapped body), so a pointer of
 * `it` becomes `translations.it` and `it.title` becomes `translations.it.title`.
 */
const prefixTranslationErrors = (rejection: ResponseReject): ResponseReject => ({
    ...rejection,
    errors: rejection.errors.map((error) =>
        typeof error.details?.field === 'string'
            ? {
                  ...error,
                  details: { ...error.details, field: `translations.${error.details.field}` }
              }
            : error
    )
});

/**
 * The image fields the server decided for a product write — never part of the contract body, so
 * they join only after validation. `imageUrl` is the upload pipeline's path, `null` to remove.
 */
export interface ProductImageExtras {
    imageUrl?: string | null;
    thumbnailUrl?: string;
    pendingImageKey?: string;
}

/**
 * Create a product and its translation rows in ONE transaction — the create door of the
 * multilingual product write surface.
 *
 * Before:  validation, nothing written yet (a bad body costs no transaction).
 *            1. the product fields' shape — `zodProductCreateSchema`, which also refuses a
 *               missing or `null` fallback locale
 *            2. the translations batch's locales and field names — `planTranslations`
 * Inside:  the row, its `PRODUCT_CREATED` outbox event, every translation row, the derived column.
 *          All commit together or none does.
 * After:   the relay wake-up, the audit entry, the image enqueue — each catching its own failure.
 *
 * `imageExtras` is server-derived, never part of the contract body, so it joins only once
 * validation has passed — the same order the controller keeps for its own merge.
 */
export const writeCreate = async (
    data: Record<string, unknown>,
    context: CallerContext,
    imageExtras: ProductImageExtras = {}
): Promise<ResponseSuccess<ProductDocument> | ResponseReject> => {
    const parsed = zodProductCreateSchema.safeParse(data);
    if (!parsed.success) return generateReject(422, validationErrors(parsed.error));

    const plan = await planTranslations(
        'product',
        toUpsertTranslationsRequest(parsed.data.translations)
    );
    if (!isTranslationPlan(plan)) return prefixTranslationErrors(plan);

    // Guaranteed present and non-null by the schema's own refinement — a plan cannot validate
    // without it.
    const fallbackEntry = parsed.data.translations[
        getFallbackLocale()
    ] as ProductTranslationFieldsWrite;
    const { translations: _translations, ...productFields } = parsed.data;

    const product = await withTransaction((session) =>
        insertProduct(
            {
                ...productFields,
                ...imageExtras,
                // `null` on a create means no image: the schema default applies to `undefined` only.
                imageUrl: imageExtras.imageUrl ?? undefined,
                title: fallbackEntry.title,
                description: fallbackEntry.description ?? ''
            },
            session
        ).then((inserted) =>
            writeTranslations(
                'product',
                inserted.id,
                plan,
                context.caller.id ?? undefined,
                session
            ).then(() => inserted)
        )
    );

    return generateSuccess(await finishCreate(product, context), 201);
};

/**
 * Update a product and write its translation rows in ONE transaction — the PUT/PATCH door of the
 * multilingual product write surface. A PUT arrives here with every omitted locale already `null`
 * ({@link clearOmittedLocales}), so this one path serves both verbs.
 *
 * Inside:  the 404 check, the row, `PRODUCT_DEACTIVATED` on a flip to inactive, the translation
 *          rows and the derived column. After: the audit entry, the old-image delete, the image
 *          enqueue — see {@link updateByIdInTransaction} and {@link finishUpdateById}.
 *
 * `data` arrives already validated: `update-product.ts` hands `createUpdateController` the same
 * `zodProductUpdateSchema`, so a bad price 422s with its field-named message at the factory.
 * `imageExtras` — see {@link writeCreate}.
 */
export const writeUpdate = async (
    id: string,
    data: z.infer<typeof zodProductUpdateSchema>,
    context: CallerContext,
    imageExtras: ProductImageExtras = {}
): Promise<ResponseSuccess<ProductDocument> | ResponseReject> => {
    const { translations, ...productFields } = data;

    const plan = translations
        ? await planTranslations('product', toUpsertTranslationsRequest(translations))
        : undefined;
    if (plan && !isTranslationPlan(plan)) return prefixTranslationErrors(plan);

    // An upsert at the fallback locale is the only slot that touches the derived index column;
    // `null` there is already refused by `zodProductUpdateSchema`'s own refinement.
    const fallbackEntry = translations?.[getFallbackLocale()];
    const derivedFields = fallbackEntry
        ? {
              ...(fallbackEntry.title === undefined ? {} : { title: fallbackEntry.title }),
              ...(fallbackEntry.description === undefined
                  ? {}
                  : { description: fallbackEntry.description ?? '' })
          }
        : {};

    const result = await withTransaction((session) =>
        updateByIdInTransaction(
            id,
            { ...productFields, ...imageExtras, ...derivedFields, touch: plan !== undefined },
            session
        ).then((outcome) =>
            plan && 'updated' in outcome
                ? writeTranslations(
                      'product',
                      id,
                      plan,
                      context.caller.id ?? undefined,
                      session
                  ).then(() => outcome)
                : outcome
        )
    );

    return 'updated' in result ? finishUpdateById(id, result, context) : result;
};

/** What a stated locale of a product's `translations` may carry: the title is the row's own. */
const TRANSLATED_FIELDS = ['description'] as const;

/**
 * PUT's `translations` is the whole set (RFC 9110 §9.3.4): every locale the product holds and the
 * body leaves out becomes `null` — the same signal a PATCH sends to delete one — and a description
 * a stated locale leaves out becomes `null` too, the merge's own way to clear a field. The
 * fallback locale is never among the deleted: the PUT schema refuses a body without it.
 *
 * @param id - the product being replaced
 * @param changes - the validated, filled PUT change-set
 * @returns `changes`, its `translations` naming every stored locale
 */
export const clearOmittedLocales = (
    id: string,
    changes: z.infer<typeof zodProductUpdateSchema>
): Promise<z.infer<typeof zodProductUpdateSchema>> =>
    readAllTranslations('product', id).then((stored) => {
        // A locale the body states is stated WHOLE, so its omitted description is a cleared one.
        const translations = Object.fromEntries(
            Object.entries(changes.translations ?? {}).map(([locale, entry]) => [
                locale,
                entry === null ? null : clearOmittedFields(TRANSLATED_FIELDS, entry)
            ])
        );
        for (const locale of stored.keys())
            if (!(locale in translations)) translations[locale] = null;
        return { ...changes, translations };
    });

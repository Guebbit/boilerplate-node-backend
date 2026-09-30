/**
 * @module
 * The multilingual write door: a product and its translation rows in one operation.
 */

import type { z } from 'zod';
import { getFallbackLocale } from '@infrastructure/i18n';
import {
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
import { create, updateById } from './crud';

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
 * Create a product and its translation rows in one operation — the create door of the
 * multilingual product write surface. Two validations run before anything is WRITTEN: the product
 * fields' shape (`zodProductCreateSchema`, which also refuses a missing/`null` fallback locale)
 * and the translations batch's locale/field-name legality (`planTranslations`, the
 * `kernel/translation.ts` port, validates without writing). Nothing in this codebase runs a
 * cross-collection transaction, so the achievable guarantee stops there: nothing is written until
 * both validations have already passed, not that the product write and the translations write
 * that follow are atomic with each other.
 *
 * `imageExtras` (`imageUrl`/`thumbnailUrl`/`pendingImageKey`) is server-derived, never part of the
 * contract body's string values, so it never passes through `zodProductCreateSchema` — merged in only once validation has
 * already succeeded, the same order the controller keeps for its own merge.
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

    const product = await create(
        {
            ...productFields,
            ...imageExtras,
            // `null` on a create means no image: the schema default applies to `undefined` only.
            imageUrl: imageExtras.imageUrl ?? undefined,
            title: fallbackEntry.title,
            description: fallbackEntry.description ?? ''
        },
        context
    );

    await writeTranslations('product', product.id, plan, context.caller.id ?? undefined);

    return generateSuccess(product, 201);
};

/**
 * Update a product and write its translation rows in one operation — the PUT/PATCH door of the
 * multilingual product write surface. A PUT arrives here with every omitted locale already `null`
 * ({@link clearOmittedLocales}), so this one path serves both verbs. Delegates the product write
 * itself to {@link updateById}, which already owns the 404 check and the audit emit; this only
 * adds the translations half
 * around it, so there is exactly one path deciding what "the product was updated" means.
 *
 * `data` arrives already validated: `update-product.ts` hands `createUpdateController` the same
 * `zodProductUpdateSchema`, so a bad price 422s with its field-named message at the factory —
 * there is exactly one place this body is checked, not a second, redundant one here.
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

    const result = await updateById(
        id,
        { ...productFields, ...imageExtras, ...derivedFields, touch: plan !== undefined },
        context
    );
    if (!result.success) return result;

    if (plan) await writeTranslations('product', id, plan, context.caller.id ?? undefined);

    return result;
};

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
                entry === null ? null : { description: null, ...entry }
            ])
        );
        for (const locale of stored.keys())
            if (!(locale in translations)) translations[locale] = null;
        return { ...changes, translations };
    });

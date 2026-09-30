/**
 * @module
 * Body validation against the Zod schemas, and the list clean-up writes share.
 */

import { validationErrors, type ResponseErrorItem } from '@infrastructure/http/response';
import { zodProductCreateSchema, zodProductUpdateSchema } from '../model';

/**
 * Validates a product CREATE against the Zod schema; empty array means valid.
 * Takes `unknown` on purpose: this is the boundary that establishes the type, so callers passing
 * raw request bodies don't have to cast on the way in.
 */
export const validateCreateData = (productData: unknown): ResponseErrorItem[] => {
    const parseResult = zodProductCreateSchema.safeParse(productData);
    if (!parseResult.success) return validationErrors(parseResult.error);
    return [];
};

/**
 * Validates a product PATCH against the Zod schema; empty array means valid. Every field is
 * optional at this schema's own level — only the fallback-locale guard inside `translations` can
 * still refuse an otherwise-valid-looking body.
 */
export const validateUpdateData = (productData: unknown): ResponseErrorItem[] => {
    const parseResult = zodProductUpdateSchema.safeParse(productData);
    if (!parseResult.success) return validationErrors(parseResult.error);
    return [];
};

/** Trim, drop blanks, and de-duplicate a category/tag list; `null`/non-array input becomes empty. */
export const sanitizeStringArray = (values?: string[] | null): string[] => {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
};

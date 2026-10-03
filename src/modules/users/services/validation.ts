/**
 * @module
 * Admin-form validation for `create`.
 */

import { zodUserSchema } from '../model';
import { validationErrors, type ResponseErrorItem } from '@infrastructure/http/response';

/**
 * Validate user data for admin create/edit forms; returns UI-friendly error messages (empty means
 * valid). Validates the WHOLE schema, not a `.pick()`: a pick would leave `admin`/`active`/
 * `imageUrl` unchecked, so a wrong-typed value would reach Mongoose and answer 500 instead of the
 * 422 the contract promises. Takes `unknown` since this is the boundary that establishes the type.
 */
export const validateData = (userData: unknown, requirePassword = true): ResponseErrorItem[] => {
    // `.strip()`: loosen only here, not on `zodUserSchema` itself. A PUT body legitimately
    // carries `id` — row identity, not user data — and `zodUserSchema` stays strict for its
    // other callers (signup, `PUT /account`), which must refuse a field their own contract
    // never declared.
    const schema = (
        requirePassword ? zodUserSchema : zodUserSchema.partial({ password: true })
    ).strip();

    const parseResult = schema.safeParse(userData);
    if (!parseResult.success) return validationErrors(parseResult.error);
    return [];
};

/**
 * One home for validation copy: Zod's own refusals, answered in the caller's language.
 *
 * Two paths could refuse a request and they answered in different languages. The generated schemas
 * in `@api/schemas.zod` carry no messages, so `parseBody` served Zod's built-in English to an
 * Italian client; the hand-written `zodUserSchema` / `zodProductSchema` carry `t(...)` per field
 * and served Italian. Same 422, same client, different language, and which one you got depended on
 * the endpoint.
 *
 * Zod resolves a message in precedence order — the check's own `error`, then the schema's, then
 * this global map, then its English default. Registering here therefore translates every schema in
 * the process, generated ones included, WITHOUT touching the codegen and without overriding the
 * specific copy a field already declares: `users.field-email-invalid` still wins on the field that
 * declares it, and this answers everywhere nothing does.
 *
 * The map runs at PARSE time, not at schema-construction time, so it reads the request-scoped `t`
 * and two overlapping requests in different languages cannot answer each other's. That is the same
 * property `@infrastructure/i18n` exists to protect — see `i18n/context.ts`.
 *
 * The keys are per CONSTRAINT, not per field: ~17 of them cover every generated schema, where a
 * per-field key would mean one dictionary entry for each of the 511 generated shapes.
 */

import { z } from 'zod';
import type { $ZodIssue } from 'zod/v4/core';
import { t } from '@infrastructure/i18n';

/**
 * The dictionary key for a size constraint, per what is being sized.
 *
 * A string's minimum counts characters, an array's counts items and a number's is the value
 * itself — three different sentences, so `origin` picks between them rather than one message
 * saying "too small" and leaving the reader to guess the unit.
 */
const sizeKey = (bound: 'too-small' | 'too-big', origin: string): string => {
    if (origin === 'string') return `validation.${bound}-string`;
    if (origin === 'array' || origin === 'set' || origin === 'file')
        return `validation.${bound}-items`;
    return `validation.${bound}-number`;
};

/** The formats worth their own sentence; anything else gets the generic one. */
const NAMED_FORMATS = new Set(['email', 'url', 'uuid', 'datetime', 'date', 'time']);

/**
 * One Zod issue → the sentence a client reads.
 *
 * Every branch resolves a key, so no path can fall through to Zod's English. An issue code this
 * does not name — a union mismatch, a bare `.refine()` with no message — answers the generic
 * `validation.invalid`, which is vague but translated, and vague-and-translated beats
 * precise-and-in-the-wrong-language on a form a person is looking at.
 */
const messageFor = (issue: $ZodIssue): string => {
    switch (issue.code) {
        case 'invalid_type': {
            // Absent and wrong-typed are different mistakes to whoever has to fix them: one is a
            // field left out, the other a field filled in wrongly.
            return issue.input === undefined
                ? t('validation.required')
                : t('validation.invalid-type', { expected: issue.expected });
        }

        case 'too_small': {
            return t(sizeKey('too-small', issue.origin), { minimum: String(issue.minimum) });
        }

        case 'too_big': {
            return t(sizeKey('too-big', issue.origin), { maximum: String(issue.maximum) });
        }

        case 'invalid_format': {
            return NAMED_FORMATS.has(issue.format)
                ? t(`validation.format-${issue.format}`)
                : t('validation.invalid-format');
        }

        case 'not_multiple_of': {
            return t('validation.not-multiple-of', { divisor: String(issue.divisor) });
        }

        case 'unrecognized_keys': {
            return t('validation.unrecognized-keys', { keys: issue.keys.join(', ') });
        }

        case 'invalid_value': {
            return t('validation.invalid-value', { values: issue.values.join(', ') });
        }

        default: {
            return t('validation.invalid');
        }
    }
};

/**
 * Install the map on the Zod singleton.
 *
 * Called from the boot sequence rather than at import of this file, so the ordering is visible in
 * `app.ts` next to the i18n mount it depends on: `t` must be able to resolve keys by the time a
 * request is parsed, and a side effect hidden in an import would leave that to chance.
 */
export const registerValidationMessages = (): void => {
    z.config({ customError: (issue) => messageFor(issue as $ZodIssue) });
};

/**
 * @module
 * One home for validation copy: Zod's own refusals, answered in the caller's language. Generated
 * schemas (`@api/schemas.zod`) carried no messages and fell back to Zod's English while
 * hand-written ones answered in the request's language — this global error map fixes every schema
 * without touching codegen. Runs at PARSE time, not construction time, so it reads the
 * request-scoped `t`; keys are per CONSTRAINT, not per field, and every sentence names the field
 * through `{{attribute}}` (Laravel's `:attribute`), resolved by {@link attributeOf}.
 *
 * See: docs/tools/i18n.md#validation-messages
 */

import { z } from 'zod';
import type { $ZodIssue } from 'zod/v4/core';
import { t } from '@infrastructure/i18n';

/** A field name: a letter, then word characters or hyphens. Skips indexes and locale-like keys with dots. */
const FIELD_NAME = /^[A-Za-z][\w-]*$/;

/** What `t` answers when a label key is absent; no real label can equal it. */
const NO_LABEL = '\u0000no-label';

/**
 * The human name of the field an issue is about.
 *
 * Walks the path from the END: the innermost segment that has a label wins (`items.0.productId`
 * reads "Product"), numeric indexes and unlabelled segments are skipped. Nothing labelled leaves
 * the neutral `validation.attribute-fallback` ("This field"), so a raw property name never reaches
 * a person.
 *
 * @param path - the issue path, as Zod reports it, or a dotted field split on `.`
 */
export const attributeOf = (path: readonly PropertyKey[]): string => {
    for (const segment of path.toReversed()) {
        if (typeof segment !== 'string' || !FIELD_NAME.test(segment)) continue;
        const label = t(`validation.attributes.${segment}`, { defaultValue: NO_LABEL });
        if (label !== NO_LABEL) return label;
    }
    return t('validation.attribute-fallback');
};

/**
 * The dictionary key for a size constraint, per what is being sized.
 *
 * A string's minimum counts characters, an array's counts items and a number's is the value
 * itself, so `origin` picks the unit. A bound of exactly 1 and an exclusive bound get their own
 * sentence: "at least 1 characters" and "at least 0" for `.gt(0)` are wrong, not just clumsy.
 */
const sizeKey = (
    bound: 'too-small' | 'too-big',
    issue: { origin: string; inclusive?: boolean },
    limit: number
): string => {
    const unit =
        issue.origin === 'string'
            ? 'string'
            : issue.origin === 'array' || issue.origin === 'set' || issue.origin === 'file'
              ? 'items'
              : 'number';
    if (unit === 'number')
        return `validation.${bound}-number${issue.inclusive === false ? '-exclusive' : ''}`;
    return `validation.${bound}-${unit}${limit === 1 ? '-one' : ''}`;
};

/** Zod's `expected` token → the dictionary's type word; anything else answers `other`. */
const TYPE_WORDS: Readonly<Record<string, string>> = {
    string: 'string',
    number: 'number',
    int: 'integer',
    boolean: 'boolean',
    array: 'array',
    set: 'array',
    object: 'object',
    record: 'object',
    map: 'object'
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Zod types `path` as always set, but a raw top-level issue reaches the error map without it
    const attribute = attributeOf(issue.path ?? []);

    switch (issue.code) {
        case 'invalid_type': {
            // Absent and wrong-typed are different mistakes to whoever has to fix them: one is a
            // field left out, the other a field filled in wrongly.
            return issue.input === undefined
                ? t('validation.required', { attribute })
                : t(`validation.type-${TYPE_WORDS[issue.expected] ?? 'other'}`, { attribute });
        }

        case 'too_small': {
            const minimum = Number(issue.minimum);
            // A string that must hold at least one character is "must not be empty" (Laravel `filled`).
            if (issue.origin === 'string' && minimum === 1 && issue.inclusive !== false)
                return t('validation.filled', { attribute });
            return t(sizeKey('too-small', issue, minimum), {
                attribute,
                minimum: String(issue.minimum)
            });
        }

        case 'too_big': {
            return t(sizeKey('too-big', issue, Number(issue.maximum)), {
                attribute,
                maximum: String(issue.maximum)
            });
        }

        case 'invalid_format': {
            return NAMED_FORMATS.has(issue.format)
                ? t(`validation.format-${issue.format}`, { attribute })
                : t('validation.invalid-format', { attribute });
        }

        case 'not_multiple_of': {
            return t('validation.not-multiple-of', { attribute, divisor: String(issue.divisor) });
        }

        case 'unrecognized_keys': {
            return t('validation.unrecognized-keys', { keys: issue.keys.join(', ') });
        }

        case 'invalid_value': {
            return t('validation.invalid-value', {
                attribute,
                values: issue.values.map(String).join(', ')
            });
        }

        default: {
            return t('validation.invalid', { attribute });
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
    // `customError` is Zod's global message hook, used instead of overriding per schema.
    z.config({ customError: (issue) => messageFor(issue as $ZodIssue) });
};

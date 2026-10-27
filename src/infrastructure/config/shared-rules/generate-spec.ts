/**
 * @module
 * How a rules file becomes a committed `as const` TypeScript file: the spec a rule declares, and
 * the schema helper for the one list shape that needs it. Read by `regenerate`, never at runtime.
 *
 * Relative imports only: see `src/infrastructure/config/shared-rules/load.ts`.
 *
 * See: docs/theory/shared-rules.md
 */

import { z } from 'zod';

/**
 * How one top-level field of a rules file is written out.
 *
 * - `verbatim`: the parsed data, dumped as an `as const` literal.
 * - `keyed-list`: a list of `{ value, description }` becomes `{ KEY: 'value' }`, one JSDoc per key.
 */
export type GenerateShape = 'verbatim' | 'keyed-list';

/** One exported constant in a generated file. */
export interface GeneratedExport {
    /** The constant's name. */
    exportName: string;
    /** How the data is written. */
    shape: GenerateShape;
    /** The top-level YAML field it comes from; the whole document when absent. */
    field?: string;
    /** The constant's docblock. */
    description: string;
}

/** What a rules file generates. */
export interface GenerateSpec {
    /** Repo-relative path of the committed `.generated.ts`. */
    out: string;
    /** The constants it holds, in order. */
    exports: readonly GeneratedExport[];
}

/** One entry of a `keyed-list`. */
export interface KeyedEntry {
    /** The wire string; the constant's key is derived from it. */
    value: string;
    /** The key's docblock. */
    description: string;
}

/**
 * Schema of a `keyed-list` field: unique, non-empty, every value matching `pattern`.
 *
 * @param pattern - what each `value` must look like
 * @returns the Zod schema of the list
 */
export const keyedListSchema = (pattern: RegExp): z.ZodType<KeyedEntry[]> =>
    z
        .array(z.strictObject({ value: z.string().regex(pattern), description: z.string().min(1) }))
        .min(1)
        .refine((entries) => new Set(entries.map((entry) => entry.value)).size === entries.length, {
            message: 'a value is listed twice'
        });

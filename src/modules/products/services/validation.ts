/**
 * @module
 * The list clean-up writes share.
 */

/** Trim, drop blanks, and de-duplicate a category/tag list; `null`/non-array input becomes empty. */
export const sanitizeStringArray = (values?: string[] | null): string[] => {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
};

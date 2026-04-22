/**
 * Parse booleans coming from query strings/forms/bodies.
 */
export const toBooleanFlag = (value: unknown): boolean =>
    value === true || value === 'true' || value === 1 || value === '1';

/**
 * Parse optional numeric values while preserving undefined when invalid/missing.
 */
export const toNumberOrUndefined = (value: unknown): number | undefined => {
    if (value === undefined || value === null || value === '') return;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
};

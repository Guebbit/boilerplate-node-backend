/**
 * Normalize pagination parameters from a pre-merged source object.
 * Falls back to NODE_SETTINGS_PAGINATION_PAGE_SIZE env var.
 *
 * Usage: extractPagination({ page: request.body.page ?? request.query.page, pageSize: ... })
 */
export const extractPagination = (
    parameters: { page?: string | number; pageSize?: string | number } = {}
): { page: number | undefined; pageSize: number | undefined } => {
    const pageSizeRaw = parameters.pageSize ?? process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;
    return {
        page: parameters.page ? Number(parameters.page) : undefined,
        pageSize: pageSizeRaw ? Number(pageSizeRaw) : undefined
    };
};

/**
 * Pick the first defined non-empty value across multiple sources in priority order.
 * Usage: extractId(request.parameters.id, request.body.id, request.query.id)
 */
export const extractId = (...candidates: (string | undefined)[]): string | undefined =>
    candidates.find(Boolean) as string | undefined;

/**
 * Parse a request input that can be string[], comma-separated string, or scalar into a clean string[].
 */
export const extractStringList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === 'string')
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    if (value === undefined || value === null) return [];
    const normalized = String(value).trim();
    return normalized ? [normalized] : [];
};

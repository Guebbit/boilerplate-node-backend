/**
 * Shared pagination/filter helpers.
 * Extracts common search logic to satisfy OCP — new filter conventions
 * require changes in one place instead of every service.
 */

export interface IPaginationInput {
    page?: number | string | null;
    pageSize?: number | string | null;
}

export interface IPaginationResult {
    page: number;
    pageSize: number;
    skip: number;
}

export interface IPaginatedMeta {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
}

/**
 * Normalize pagination parameters with safe defaults and bounds.
 */
export const normalizePagination = (input: IPaginationInput = {}): IPaginationResult => {
    const page = Math.max(1, Number(input.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 10) || 10));
    return { page, pageSize, skip: (page - 1) * pageSize };
};

/**
 * Build pagination meta from total count.
 */
export const buildPaginatedMeta = (
    pagination: IPaginationResult,
    totalItems: number
): IPaginatedMeta => ({
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.pageSize)
});

/**
 * Add a text-search $or clause to a Mongoose filter.
 * Searches across multiple fields with case-insensitive regex.
 */
export const addTextFilter = (
    where: Record<string, unknown>,
    text: string | undefined | null,
    fields: string[]
): void => {
    if (!text || String(text).trim() === '') return;
    const trimmed = String(text).trim();
    where.$or = fields.map((field) => ({
        [field]: { $regex: trimmed, $options: 'i' }
    }));
};

/**
 * Add a regex filter for a single field (case-insensitive).
 */
export const addRegexFilter = (
    where: Record<string, unknown>,
    field: string,
    value: string | undefined | null
): void => {
    if (!value || String(value).trim() === '') return;
    where[field] = {
        $regex: String(value).trim(),
        $options: 'i'
    };
};

const DEFAULT_SORT: Record<string, 1 | -1> = { createdAt: -1 };

/**
 * Execute a paginated search: count + findAll + meta assembly.
 * Centralizes the repeated count→findAll→buildPaginatedMeta pattern.
 */
export const paginatedSearch = <TDocument, TWhere = unknown>(
    repository: {
        count: (where: TWhere) => Promise<number>;
        findAll: (where: TWhere, options: { sort: Record<string, 1 | -1>; skip: number; limit: number }) => Promise<TDocument[]> | PromiseLike<TDocument[]>;
    },
    where: TWhere,
    pagination: IPaginationResult,
    sort: Record<string, 1 | -1> = DEFAULT_SORT
): Promise<{ items: TDocument[]; meta: IPaginatedMeta }> =>
    repository.count(where).then((totalItems) =>
        repository
            .findAll(where, {
                sort,
                skip: pagination.skip,
                limit: pagination.pageSize
            })
            .then((items) => ({
                items,
                meta: buildPaginatedMeta(pagination, totalItems)
            }))
    );

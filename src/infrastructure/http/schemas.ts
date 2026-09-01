/**
 * @module
 * Contract scalars, as they arrive over HTTP. `readInput` decodes a transport but deliberately
 * does not validate, so these are the schemas for the handful of scalars more than one endpoint
 * accepts — written once rather than re-derived per controller, which is how `GET /products` and
 * `GET /feedback` once disagreed on what a legal page size is. Bounds and defaults come from the
 * orval-generated constants, so they track `openapi.yaml` rather than drifting from it.
 */

import { z } from 'zod';

/**
 * Largest `pageSize` a caller may request, declared here rather than imported from the generated
 * client.
 *
 * `PageSize` is one shared `openapi.yaml` component, but orval flattens it into forty identical
 * per-operation constants — importing any one would put a domain's name in `infrastructure` and
 * break the day that module's contract fragment is deleted. So infrastructure owns the scalar, and
 * `tests/cross-cutting/contract-scalars.test.ts` proves it still matches what orval generated.
 */
const PAGE_SIZE_MAX = 100;

/**
 * Largest `page` a caller may request — BETTER_SECURITY.md 3.3a. Same shared-component situation
 * as {@link PAGE_SIZE_MAX}: `Page` is one `openapi.yaml` component, orval flattens it into a
 * per-operation constant each, so this is the one place that owns the number.
 *
 * At `PAGE_SIZE_MAX` items per page, this bounds the deepest Mongo `skip` a request can ask for
 * to 10,000 × 100 = 1,000,000 documents — expensive, but not unbounded. A caller past this is not
 * paging through a UI; that isn't what `page` is for.
 */
const PAGE_MAX = 10_000;

/**
 * Default for `hardDelete` when a caller sends nothing: soft delete.
 *
 * Same shared-component situation as {@link PAGE_SIZE_MAX} — `hardDelete` is one shared `openapi.yaml`
 * component flattened into forty per-operation constants by orval, so this is declared here rather
 * than imported from any one of them.
 */
const HARD_DELETE_DEFAULT = false;

/**
 * A blank value means "not specified", not "specified as empty".
 *
 * `?page=` and `?hardDelete=` are what a form submits for an untouched field, and neither is an
 * attempt to set anything. Mapping them to `undefined` lets `.optional()` / `.default()` handle
 * them as absent instead of producing a spurious 422.
 */
const blankToUndefined = (value: unknown): unknown =>
    // `== null` catches the explicit `null` a JSON body can carry as well as `undefined`.
    value === '' || value == undefined ? undefined : value;

/**
 * The soft/hard delete switch.
 *
 * Read as a VALUE, never as presence: `!!request.query.hardDelete` would make `?hardDelete=false`
 * permanently delete the record, since the string `'false'` is truthy. `readInput` decodes the
 * URL's string spellings; anything unrecognised fails this schema and answers 422 rather than
 * being guessed at. Absent means soft delete — a TOGGLE that stamps `deletedAt` if absent and
 * clears it if present, so a second `DELETE` RESTORES the record.
 */
export const hardDeleteSchema = z.preprocess(
    blankToUndefined,
    z.boolean().default(HARD_DELETE_DEFAULT)
);

/**
 * `page` as a caller sends it: coerced because a query string carries numbers as text,
 * integer-only because `?page=1.5` produced a fractional `skip`. Bounded because `openapi.yaml`
 * declares `maximum: 10000` ({@link PAGE_MAX}) — an unbounded `page` times `pageSize` is an
 * unbounded Mongo `skip`, and this is the endpoint's own declared bound, not a new rule.
 *
 * Absent stays absent — `normalizePagination` (`@infrastructure/persistence/search`) is the single
 * authority on defaults, and defaulting here too would just add numbers it always overwrites.
 */
export const pageSchema = z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(PAGE_MAX).optional()
);

/**
 * `pageSize` as a caller sends it.
 *
 * Same coercion as {@link pageSchema}, bounded because `openapi.yaml` declares `maximum: 100`
 * ({@link PAGE_SIZE_MAX}) and an endpoint that ignores its own declared bound is not honouring its
 * contract.
 */
export const pageSizeSchema = z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).optional()
);

/** The pair, for an endpoint that validates nothing else. */
export const paginationSchema = z.object({ page: pageSchema, pageSize: pageSizeSchema });

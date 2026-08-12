/**
 * Contract scalars, as they arrive over HTTP.
 *
 * `readInput` decodes a transport; it deliberately does not validate, so a value it could not
 * recognise reaches a schema intact. These are the schemas for the handful of scalars that more
 * than one endpoint accepts, so the answer to "what is a legal page size" is written once rather
 * than re-derived per controller — which is how `GET /products` came to answer 422 for
 * `?pageSize=500` while `GET /feedback` silently clamped the same request.
 *
 * Bounds and defaults come from the orval-generated constants, so they track `openapi.yaml`
 * rather than drifting from it.
 */

import { z } from 'zod';

/*
 * The bounds, declared here rather than imported from the generated client.
 *
 * `PageSize` and `hardDelete` are single shared components in `openapi.yaml`, so every operation
 * referencing them carries the same numbers — but orval flattens a shared component into one
 * constant PER OPERATION. There is no shared constant to import, only forty identical ones named
 * after whichever endpoint they were emitted for. Importing one of those pairs — the `products`
 * one, say — would put a domain's name in `infrastructure` and break outright the day that
 * module's contract fragment is deleted.
 *
 * So infrastructure owns the scalar and `tests/cross-cutting/contract-scalars.test.ts` proves it still
 * matches every operation orval generated. The dependency is inverted, not dropped: change the
 * component in `openapi.yaml` without changing these and the build fails, which is the property
 * the import was there for.
 */
const PAGE_SIZE_MAX = 100;
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
 * permanently delete the record, because the string `'false'` is truthy. It is a boolean in the
 * contract and it is a boolean here: `readInput` decodes the string spellings a URL can carry, and
 * anything left unrecognised fails this schema and answers 422 rather than being guessed at.
 * Absent means soft delete, which is what the contract's `default: false` says.
 */
export const hardDeleteSchema = z.preprocess(
    blankToUndefined,
    z.boolean().default(HARD_DELETE_DEFAULT)
);

/**
 * `page` / `pageSize` as a caller sends them.
 *
 * Coerced because a query string carries numbers as text, bounded because `openapi.yaml` declares
 * `minimum: 1` and `maximum: 100` and an endpoint that ignores its own declared bounds is not
 * honouring its contract. Integer-only for the same reason — `?page=1.5` produced a fractional
 * `skip`, which is not a page.
 *
 * Absent stays absent: `normalizePagination` (`@infrastructure/persistence/search`) is the single authority on
 * what "page 1, ten per page" means, and it runs on every search. Defaulting here as well would
 * only add a second set of numbers that the later one always overwrites.
 */
export const pageSchema = z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional());

export const pageSizeSchema = z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).optional()
);

/** The pair, for an endpoint that validates nothing else. */
export const paginationSchema = z.object({ page: pageSchema, pageSize: pageSizeSchema });

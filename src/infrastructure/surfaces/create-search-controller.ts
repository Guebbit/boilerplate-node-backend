/**
 * @module
 * The search-controller shape shared by `products`, `users` and `orders`, each exposing the same
 * pair of endpoints — `GET /x` and `POST /x/search` — behind one controller:
 * `readInput(surface:'search')` → merge in whatever the module needs decoded → `parseBody` against
 * the module's own schema → run the search → `successResponse` → `catchAs`. Only two things differ
 * per module: which extra fields the query form needs before validation, and what actually runs
 * the search.
 *
 * `feedback`'s search controller is deliberately NOT built on this: it validates only pagination
 * and hand-lists its cache key rather than deriving one from a Zod schema (see `get-feedback.ts`),
 * so it has no `extendInput`/`schema` pair to hand this factory in the first place.
 */

import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import { successResponse } from '@infrastructure/http/response';
import { readInput } from '@infrastructure/http/request';
import { catchAs, parseBody } from '@infrastructure/http/controller';

/** What makes one entity's search different from another's. */
export interface SearchControllerSpec<TSchema extends ZodType, TResult> {
    /**
     * The entity, plural — `'products'`. Used to name the operation (`getProducts`), so a stack
     * trace and the generated module-surface tables in `docs/modules/` agree with the handler.
     */
    entity: string;
    /** The Zod schema the merged input is validated against. */
    schema: TSchema;
    /**
     * Fields to overlay onto `readInput`'s result before validation — coercions or request-derived
     * values (`callerScope`'s admin check, a multi-value query param picked down to one) that a
     * plain field list cannot express. Returns only the overlay, not the whole merged object.
     * Omitted when a module needs no such thing.
     */
    extendInput?: (input: Record<string, unknown>, request: Request) => Record<string, unknown>;
    /** Run the module's own search, given the validated input and the request it came from. */
    runSearch: (parsed: TSchema['_output'], request: Request) => Promise<TResult>;
}

/**
 * Build a module's search controller.
 *
 * @param spec - the three things that differ per entity
 * @returns the express handler, named for the entity it searches
 */
export const createSearchController = <TSchema extends ZodType, TResult>({
    entity,
    schema,
    extendInput,
    runSearch
}: SearchControllerSpec<TSchema, TResult>) => {
    // The name printed in stack traces, the request log line and `docs/modules/` — e.g. `getProducts`.
    const operation = `get${entity.charAt(0).toUpperCase()}${entity.slice(1)}`;

    // A computed property key, not a plain function expression, so `handler.name` is `operation`
    // instead of the generic name an anonymous function would carry.
    const handler = {
        [operation](request: Request, response: Response) {
            // readInput: merges params/query/body into one object, per the `search` surface's
            // rules — see docs/theory/request-input.md.
            const input = readInput(request, { surface: 'search', ids: ['id'] });
            // extendInput: the module's own overlay — coercions or request-derived values a plain
            // field list can't express.
            const merged = extendInput ? { ...input, ...extendInput(input, request) } : input;

            // parseBody: validates the merged input against the module's schema; 422s and returns
            // undefined on failure.
            const parsed = parseBody(schema, merged, response);
            if (!parsed) return;

            // runSearch: the module's own search, given the validated input.
            return runSearch(parsed, request)
                .then((result) => {
                    successResponse(response, result);
                })
                .catch(catchAs(response, operation)); // logs the failure under `operation`, then 500s
        }
    }[operation];

    return handler;
};

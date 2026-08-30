/**
 * The search-controller shape, written once.
 *
 * `products`, `users` and `orders` each expose the same pair of endpoints — `GET /x` and
 * `POST /x/search` — behind one controller, and until now that controller was hand-copied three
 * times: `readInput(surface:'search')` → merge in whatever the module needs decoded → `parseBody`
 * against the module's own schema → run the search → `successResponse` → `catchAs`. Only two
 * things differ per module — which extra fields the query form needs before validation, and what
 * actually runs the search — so the rest is duplication of the WHOLE controller, the same shape
 * `createDeleteController` addresses for deletes.
 *
 * `feedback`'s search controller is deliberately NOT built on this: it validates only pagination
 * and hand-lists its cache key rather than deriving one from a Zod schema (see `get-feedback.ts`),
 * so it has no `extendInput`/`schema` pair to hand this factory in the first place.
 */

import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import { successResponse } from './response';
import { readInput } from './request';
import { catchAs, parseBody } from './controller';

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
    const operation = `get${entity.charAt(0).toUpperCase()}${entity.slice(1)}`;

    const handler = {
        [operation](request: Request, response: Response) {
            // One declaration instead of a per-field assembly — see docs/theory/request-input.md.
            const input = readInput(request, { surface: 'search', ids: ['id'] });
            const merged = extendInput ? { ...input, ...extendInput(input, request) } : input;

            const parsed = parseBody(schema, merged, response);
            if (!parsed) return;

            return runSearch(parsed, request)
                .then((result) => {
                    successResponse(response, result);
                })
                .catch(catchAs(response, operation));
        }
    }[operation];

    return handler;
};

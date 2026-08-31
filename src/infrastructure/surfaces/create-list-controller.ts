/**
 * @module
 * The paged-list controller, written once: `readInput(surface:'list')` → validate against the
 * query schema → run the service → answer its `data` → `catchAs`. Sibling of
 * `createSearchController`, kept separate because a search reads the body FIRST (letting one
 * controller serve `GET /x` and `POST /x/search`), while a list has no body to read — folding
 * the two would mean a `surface` knob on a factory whose whole subject is where input comes from.
 */

import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import { successResponse } from '@infrastructure/http/response';
import { readInput, type RequestInputDeclaration } from '@infrastructure/http/request';
import { catchAs, parseBody } from '@infrastructure/http/controller';

/** What makes one entity's list different from another's. */
export interface ListControllerSpec<TSchema extends ZodType> {
    /**
     * The entity, plural and camel-cased — `'inventoryLevels'`. Names the operation
     * (`getInventoryLevels`), so the log line, a stack trace and the generated tables in
     * `docs/modules/` agree with the handler.
     */
    entity: string;
    /**
     * The generated query schema, relaxed to accept what a query string can carry — `page`/
     * `pageSize` from `@infrastructure/http/schemas`, then `.partial()`, since absent must stay
     * absent for `normalizePagination` to own the defaults.
     */
    schema: TSchema;
    /**
     * The fields a query string cannot type — the same declaration `readInput` takes, minus the
     * surface, which is `list` by definition here.
     */
    input?: Omit<RequestInputDeclaration<string>, 'surface'>;
    /**
     * Run the module's own query, given the validated input. It answers the service envelope —
     * `data` is what reaches the client, and it is optional there for the failure shapes this
     * route cannot produce.
     */
    runList: (parsed: TSchema['_output'], request: Request) => Promise<{ data?: unknown }>;
}

/**
 * Build a module's list controller.
 *
 * @param spec - the things that differ per entity
 * @returns the express handler, named for the entity it lists
 */
export const createListController = <TSchema extends ZodType>({
    entity,
    schema,
    input,
    runList
}: ListControllerSpec<TSchema>) => {
    // The name printed in stack traces, the request log line and `docs/modules/` — e.g. `getInventoryLevels`.
    const operation = `get${entity.charAt(0).toUpperCase()}${entity.slice(1)}`;

    // A computed property key, not a plain function expression, so `handler.name` is `operation`
    // instead of the generic name an anonymous function would carry.
    const handler = {
        [operation](request: Request, response: Response) {
            // readInput merges the query string into one object per the `list` surface's rules
            // (docs/theory/request-input.md); parseBody then validates it against the query
            // schema, 422ing and returning undefined on failure.
            const parsed = parseBody(
                schema,
                readInput(request, { ...input, surface: 'list' }),
                response
            );
            if (!parsed) return Promise.resolve();

            // runList: the module's own query, given the validated input.
            return runList(parsed, request)
                .then((result) => {
                    successResponse(response, result.data);
                })
                .catch(catchAs(response, operation)); // logs the failure under `operation`, then 500s
        }
    }[operation];

    return handler;
};

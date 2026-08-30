/**
 * The paged-list controller, written once.
 *
 * A `list` route is a GET with no body-carrying sibling: the query string is the only place a
 * filter can arrive from, so the whole controller is `readInput(surface:'list')` → validate against
 * the generated query schema → run the service → answer its `data` → `catchAs`. Inventory's two
 * boards are that shape twice over, down to the docblock on the schema.
 *
 * The sibling of `createSearchController`, and separate from it on purpose: a search reads the body
 * FIRST (that is what lets one controller serve `GET /x` and `POST /x/search`), and a list has no
 * body to read. Folding the two would mean a `surface` knob on a factory whose whole subject is
 * where the input comes from.
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
            // readInput: merges the query string (plus any extra fields the module declared) into
            // one object, per the `list` surface's rules — see docs/theory/request-input.md.
            // parseBody: validates that object against the query schema; 422s and returns
            // undefined on failure.
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

/**
 * @module
 * The update controller shared by every resource that takes both PUT (replace) and PATCH (merge).
 * One pipeline; the verb only changes the front of it:
 *
 * ```
 * PUT   body → validate(ReplaceSchema) → fill omitted clearable fields with null
 *                                      → (completeReplace) null every stored map key left out ─┐
 * PATCH body → validate(PatchSchema)   ─────────────────────────────────────────────────────────┴→ update(id, changes)
 *                                                                       value → $set · null → $unset
 * ```
 *
 * See: docs/theory/request-flow.md#put-replaces-patch-merges
 */

import type { Request, Response } from 'express';
import type { ZodObject, ZodType } from 'zod';
import { successResponse } from '@infrastructure/http/response';
import {
    extractAndValidateId,
    readInput,
    type RequestInputDeclaration
} from '@infrastructure/http/request';
import {
    catchAs,
    namedHandler,
    operationName,
    parseBody,
    refused,
    type ServiceResult
} from '@infrastructure/http/controller';

/** What makes one entity's update different from another's. */
export interface UpdateControllerSpec<TReplace extends ZodObject, TPatch extends ZodObject, TRow> {
    /** The entity, lower-case and singular — `'user'`. Names both handlers. */
    entity: string;
    /** The PUT body's schema — every writable field, required ones genuinely required. */
    replaceSchema: TReplace;
    /** The PATCH body's schema — every writable field optional, nullable where clearing it is legal. */
    patchSchema: TPatch;
    /** The fields a multipart body carries as strings — the same declaration `readInput` takes. */
    input?: Omit<RequestInputDeclaration<string>, 'surface' | 'ids'>;
    /**
     * The module's own merge: 404 when absent, 422/409 when the change itself is refused, the
     * saved row otherwise. A `null` in `changes` means "clear this field" — turning it into
     * `$unset` rather than a stored `null` is this function's job (see `clearedOrValue`).
     */
    update: (
        id: string,
        changes: TPatch['_output'],
        request: Request
    ) => Promise<ServiceResult<TRow>>;
    /**
     * The saved row in the entity's contract shape — the same projection its own reads answer
     * with, so an update never hands out a field a read would not.
     */
    present: (row: TRow, request: Request) => unknown;
    /**
     * Where the row's id comes from when it is not a validated `:id` path param — the caller's own
     * record, or a differently named param. Omit it for `/x/:id`, which 422s a malformed id.
     */
    idFrom?: (request: Request) => string;
    /**
     * PUT only, after the omitted fields are filled: clear what the schema alone cannot name — the
     * stored keys of a keyed map the body left out (a product's `translations` locales), each set
     * to `null`, the signal a PATCH would have used. Omit it when the resource has no such map.
     */
    completeReplace?: (id: string, changes: TPatch['_output']) => Promise<TPatch['_output']>;
    /**
     * Fields OUTSIDE the PUT representation: an omission keeps them, as on a PATCH, though the
     * schema accepts `null`. An uploaded file is the case — a client cannot send the current one
     * back, so a PUT that never mentions `imageUrl` must not wipe it; an explicit `null` still
     * clears. Omit it for a resource with no such field.
     */
    keptWhenOmitted?: readonly string[];
}

/**
 * The fields a PUT clears by omitting them: every field whose schema accepts `null`. A field that
 * cannot be `null` — a password, a consent flag — is left unchanged when omitted instead.
 *
 * @param schema - the PUT body's schema
 * @returns the names of its nullable fields
 */
export const clearableFields = (schema: ZodObject): string[] =>
    // The base `ZodObject` types its shape loosely; every value in it is a field schema.
    Object.entries<ZodType>(schema.shape)
        .filter(([, field]) => field.safeParse(null).success)
        .map(([name]) => name);

/**
 * Fill every clearable field the caller's PUT body omitted with `null` — "the body IS the new
 * resource" (RFC 9110 §9.3.4) stated as a change-set a PATCH could have sent.
 *
 * @param body - the already-validated PUT body
 * @param fields - {@link clearableFields} of the PUT schema
 * @returns `body`, with every one of `fields` present — `null` where it was absent
 */
export const fillOmittedWithNull = (
    body: Record<string, unknown>,
    fields: readonly string[]
): Record<string, unknown> => {
    const filled = { ...body };
    for (const field of fields) if (!(field in filled)) filled[field] = null;
    return filled;
};

/**
 * Build a module's update controller: one PUT (replace) handler and one PATCH (merge) handler,
 * sharing everything but which schema validates the body and whether omitted fields are filled.
 *
 * @param spec - the things that differ per entity
 * @returns `{ replace, update }` — two named express handlers over one pipeline
 */
export const createUpdateController = <TReplace extends ZodObject, TPatch extends ZodObject, TRow>({
    entity,
    replaceSchema,
    patchSchema,
    input,
    update,
    present,
    idFrom,
    completeReplace,
    keptWhenOmitted = []
}: UpdateControllerSpec<TReplace, TPatch, TRow>): {
    replace: (request: Request, response: Response) => Promise<void>;
    update: (request: Request, response: Response) => Promise<void>;
} => {
    // Derived once per controller, not per request — the schema never changes.
    const replaceFills = clearableFields(replaceSchema).filter(
        (field) => !keptWhenOmitted.includes(field)
    );

    /**
     * The one pipeline both verbs run: id → decode → validate → (PUT only) fill and complete →
     * `update()` → respond. `schema`, `fills` and `complete` are the only things that differ
     * between the verbs.
     */
    const run =
        (
            operation: string,
            schema: ZodObject,
            fills: readonly string[],
            complete?: UpdateControllerSpec<TReplace, TPatch, TRow>['completeReplace']
        ) =>
        (request: Request, response: Response): Promise<void> => {
            const id = idFrom ? idFrom(request) : extractAndValidateId(request, response, 'path');
            if (!id) return Promise.resolve();

            // `create` is `readInput`'s body-only surface: the id was resolved above, and a path
            // param merged into this object would fail the body's strict schema.
            const body = parseBody(
                schema,
                readInput(request, { ...input, surface: 'create' }),
                response
            );
            if (body === undefined) return Promise.resolve();

            // The PATCH schema's output type is the contract of `update()`; a filled PUT body is
            // the same shape, since every field it adds is one the PUT schema itself accepts null for.
            const changes = fillOmittedWithNull(body, fills) as TPatch['_output'];

            return (complete ? complete(id, changes) : Promise.resolve(changes))
                .then((completed) => update(id, completed, request))
                .then((result) => {
                    // Sends the error envelope (404, 409, 422) and stops here if refused.
                    if (refused(response, result)) return;
                    return Promise.resolve(present(result.data, request)).then((shaped) => {
                        successResponse(response, shaped, 200, result.message);
                    });
                })
                .catch(catchAs(response, operation));
        };

    const replaceOperation = operationName('replace', entity);
    const updateOperation = operationName('update', entity);

    return {
        replace: namedHandler(
            replaceOperation,
            run(replaceOperation, replaceSchema, replaceFills, completeReplace)
        ),
        update: namedHandler(updateOperation, run(updateOperation, patchSchema, []))
    };
};

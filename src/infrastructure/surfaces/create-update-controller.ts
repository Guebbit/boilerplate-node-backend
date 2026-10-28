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
import { setEtag, withIfMatch } from '@infrastructure/http/preconditions';
import { readInput, type RequestInputDeclaration } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import {
    catchAs,
    namedHandler,
    operationName,
    parseBody,
    refused,
    type ServiceResult
} from '@infrastructure/http/controller';
import { fillOmittedWithNull } from '@infrastructure/object-guards';

/**
 * Where an update's row id comes from: exactly one of the two.
 *
 * A path param (`notFoundKey` says what a malformed or unknown one answers), or a value that is
 * not an id the caller chose (`idFrom`): the caller's own record, a language tag.
 */
export type UpdateIdSource =
    | {
          /** The i18n key answered when the `:id` matches nothing, or is not an id at all. */
          notFoundKey: string;
          /** The path param carrying the id, when it is not `:id` — `'addressId'`. */
          idParam?: string;
          idFrom?: never;
      }
    | {
          /** Where the row's id comes from, for a route with no id in its path. */
          idFrom: (request: Request) => string;
          notFoundKey?: never;
          idParam?: never;
      };

/** What makes one entity's PATCH different from another's. */
export type PatchControllerSpec<TPatch extends ZodObject, TRow> = UpdateIdSource & {
    /** The entity, lower-case and singular — `'user'`. Names both handlers. */
    entity: string;
    /**
     * Whether the contract declares `If-Match` / `412` for this resource. `true` fences the write
     * on the request's `If-Match`; `false` ignores that header entirely, so the route never
     * answers a `412` its contract does not declare.
     */
    versioned: boolean;
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
};

/** What makes one entity's update different from another's: its PATCH, plus its PUT. */
export type UpdateControllerSpec<
    TReplace extends ZodObject,
    TPatch extends ZodObject,
    TRow
> = PatchControllerSpec<TPatch, TRow> & {
    /** The PUT body's schema — every writable field, required ones genuinely required. */
    replaceSchema: TReplace;
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
};

/**
 * The fields a PUT clears by omitting them: every field whose schema accepts `null`. A field that
 * cannot be `null` has no cleared state, so the PUT schema should list it as `required` (omitting it
 * is then a 422); one that slips through unrequired is left unchanged, never cleared.
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
 * The row id this update acts on, or `undefined` once the refusal has been sent.
 *
 * @param source - where the controller's spec says the id comes from
 * @param request - the incoming request
 * @param response - the express response, used only on failure
 */
const idOf = (source: UpdateIdSource, request: Request, response: Response): string | undefined =>
    source.idFrom
        ? source.idFrom(request)
        : requireId(request, response, { notFound: source.notFoundKey, name: source.idParam });

/**
 * The one pipeline both verbs run: id → decode → validate → (PUT only) fill and complete →
 * `update()` (under the request's `If-Match`, if any, on a versioned resource) → respond with the
 * new `ETag`. `schema`, `fills` and `complete` are the only things that differ between the verbs.
 *
 * @param spec - the things that differ per entity
 * @returns a builder: the named operation's handler for one verb's schema, fills and completion
 */
const pipelineOf =
    <TPatch extends ZodObject, TRow>(spec: PatchControllerSpec<TPatch, TRow>) =>
    (
        operation: string,
        schema: ZodObject,
        fills: readonly string[],
        complete?: (id: string, changes: TPatch['_output']) => Promise<TPatch['_output']>
    ) =>
    (request: Request, response: Response): Promise<void> => {
        const { versioned, input, update, present } = spec;

        // A malformed path id answers as an unknown one, before the body is even read.
        const id = idOf(spec, request, response);
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

        return (
            (complete ? complete(id, changes) : Promise.resolve(changes))
                // On a versioned resource an `If-Match` fences the row's write; without one, or on
                // an unversioned resource, this is just `update()`.
                .then((completed) =>
                    versioned
                        ? withIfMatch(request, id, () => update(id, completed, request))
                        : update(id, completed, request)
                )
                .then((result) => {
                    // Sends the error envelope (404, 409, 422) and stops here if refused.
                    if (refused(response, result)) return;
                    // The saved row's new tag, so the caller's next edit needs no re-read.
                    setEtag(response, result.data);
                    return Promise.resolve(present(result.data, request)).then((shaped) => {
                        successResponse(response, shaped, 200);
                    });
                })
                .catch(catchAs(response, operation))
        );
    };

/**
 * Build a PATCH-only update controller, for a resource whose body cannot be the whole thing
 * (a triage state of a bigger record): no PUT is offered, so nothing can clear the rest.
 *
 * @param spec - the things that differ per entity
 * @returns the named express PATCH handler
 */
export const createPatchController = <TPatch extends ZodObject, TRow>(
    spec: PatchControllerSpec<TPatch, TRow>
): ((request: Request, response: Response) => Promise<void>) => {
    const operation = operationName('update', spec.entity);
    return namedHandler(operation, pipelineOf(spec)(operation, spec.patchSchema, []));
};

/**
 * Build a module's update controller: one PUT (replace) handler and one PATCH (merge) handler,
 * sharing everything but which schema validates the body and whether omitted fields are filled.
 *
 * @param spec - the things that differ per entity
 * @returns `{ replace, update }` — two named express handlers over one pipeline
 */
export const createUpdateController = <TReplace extends ZodObject, TPatch extends ZodObject, TRow>(
    spec: UpdateControllerSpec<TReplace, TPatch, TRow>
): {
    replace: (request: Request, response: Response) => Promise<void>;
    update: (request: Request, response: Response) => Promise<void>;
} => {
    const { replaceSchema, completeReplace, keptWhenOmitted = [] } = spec;

    // Derived once per controller, not per request — the schema never changes.
    const replaceFills = clearableFields(replaceSchema).filter(
        (field) => !keptWhenOmitted.includes(field)
    );
    const pipeline = pipelineOf(spec);

    const replaceOperation = operationName('replace', spec.entity);

    return {
        replace: namedHandler(
            replaceOperation,
            pipeline(replaceOperation, replaceSchema, replaceFills, completeReplace)
        ),
        update: createPatchController(spec)
    };
};

/**
 * @module
 * The update controller shared by every module whose resource takes both PUT (replace) and PATCH
 * (merge) — AUDIT_0924 D17. One pipeline, and the verb only changes the front of it:
 *
 * ```
 * PUT   body → validate(ReplaceSchema) → fill every omitted writable field with null ─┐
 * PATCH body → validate(PatchSchema)   ───────────────────────────────────────────────┴→ update(id, changes)
 *                                                                     value → $set · null → $unset
 * ```
 *
 * A PUT is a PATCH that names every field: once omitted fields are filled with `null`, both verbs
 * hand the module's own `update(id, changes)` the same kind of change-set, and that function never
 * learns which verb produced it. `null` is the one way to say "clear this field" (RFC 7396 for
 * PATCH; a PUT body IS the new resource, so an omitted optional field means the same thing) — `''`
 * is never a synonym, which is why every optional free-text field in the contract carries
 * `minLength: 1` and rejects it as a 422 instead.
 *
 * See: docs/theory/request-flow.md, AUDIT_0924's D17 decision.
 */

import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import { successResponse } from '@infrastructure/http/response';
import { extractAndValidateId, callerContextOf } from '@infrastructure/http/request';
import {
    catchAsNotFound,
    namedHandler,
    operationName,
    parseBody,
    refused,
    type ServiceResult
} from '@infrastructure/http/controller';
import { recordAudit, type AuditAction } from '@infrastructure/observability/audit';

/** What makes one entity's update different from another's. */
export interface UpdateControllerSpec<TReplace extends ZodType, TPatch extends ZodType, TRow> {
    /** The entity, lower-case and singular — `'order'`; the audit `target_type` and log name. */
    entity: string;
    /** The PUT body's schema — every writable field, required ones genuinely required. */
    replaceSchema: TReplace;
    /** The PATCH body's schema — every writable field optional, nullable where clearing it is legal. */
    patchSchema: TPatch;
    /**
     * The fields a PUT must name — `Object.keys(replaceSchema.shape)`, computed by the caller
     * (never hand-kept here) so a field added to the schema is filled without anyone remembering
     * to. Passed rather than read off `replaceSchema` inside this factory because `.shape` only
     * exists on a `ZodObject`, and constraining `TReplace` to one would leak Zod's own object type
     * into every module's spec for a single derived list — see {@link fillOmittedWithNull}.
     */
    writableFields: readonly string[];
    /**
     * The module's own merge, already written and already used by both verbs before this
     * factory existed: 404 when absent, 422/409 when the change itself is refused, the saved row
     * otherwise. `changes` carries `null` for "clear this field" — turning that into `$unset`
     * (rather than storing a literal `null`) is this function's own job, not the controller's.
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
     * The module's own audit action for a successful update, recorded here once `update()`
     * resolves. Omit it — every module this factory has been wired to so far already calls
     * `recordAudit` inside its own `update()`, often with more nuance than one static action can
     * carry (users' ban/unban split, a deactivation's analytics event): passing one here on top of
     * that would double-log every successful update, not just add noise. Pass one only for a
     * module whose `update()` does not already audit itself.
     */
    auditAction?: AuditAction;
    /** The i18n key answered when the id is well-formed but matches nothing. */
    notFoundKey: string;
    /**
     * Where the row's id comes from, when it is not `:id` in the path — `PUT /account` and
     * `PATCH /account` act on the caller's OWN record, which has no id anywhere in the request:
     * it is `request.authContext.id`, already guaranteed present by the `isAuth` middleware every
     * mount behind this runs after. Omit it for the ordinary `/x/:id` shape, which still 422s a
     * missing or malformed path id the way every other id-taking controller does.
     */
    idFrom?: (request: Request) => string;
}

/**
 * Fill every field {@link UpdateControllerSpec.replaceSchema} declares but the caller's PUT body
 * omitted, with `null` — "the body IS the new resource" (RFC 9110 §9.3.4) stated as a change-set
 * a PATCH could have sent. Only ever reaches an omitted key that `replaceSchema.safeParse` already
 * accepted as legal to omit (a required-but-missing field already failed validation before this
 * runs), so blanket-filling every gap is safe.
 *
 * @param body - the already-validated PUT body
 * @param writableFields - `Object.keys(replaceSchema.shape)`
 * @returns `body`, with every field from `writableFields` present — `null` where it was absent
 */
export const fillOmittedWithNull = (
    body: Record<string, unknown>,
    writableFields: readonly string[]
): Record<string, unknown> => {
    const filled = { ...body };
    for (const field of writableFields) if (!(field in filled)) filled[field] = null;
    return filled;
};

/**
 * One field's contribution to a Mongoose document assignment: a stored `null` was never this
 * repo's spelling for "no value" (see this module's own docblock) — an UNSET field is what a
 * cleared optional field looks like on disk, and assigning `undefined` to a hydrated document's
 * path is what makes `.save()` emit `$unset` for it rather than writing a literal `null`
 * (verified against a real in-memory MongoDB: `doc.field = undefined; await doc.save()` removes
 * the path entirely). Every module's own `update()` wraps an incoming field's value with this
 * before assigning it, wherever `null` is a legal value for that field.
 *
 * @param value - a field's value off a change-set this controller built
 * @returns `value` unchanged, or `undefined` when it was `null`
 */
export const clearedOrValue = <T>(value: T | null): T | undefined => value ?? undefined;

/**
 * Build a module's update controller: one PUT (replace) handler and one PATCH (merge) handler,
 * sharing everything but which schema validates the body and whether omitted fields are filled.
 *
 * @param spec - the things that differ per entity
 * @returns `{ replace, patch }` — two named express handlers over one body
 */
export const createUpdateController = <TReplace extends ZodType, TPatch extends ZodType, TRow>({
    entity,
    replaceSchema,
    patchSchema,
    writableFields,
    update,
    present,
    auditAction,
    notFoundKey,
    idFrom
}: UpdateControllerSpec<TReplace, TPatch, TRow>): {
    replace: (request: Request, response: Response) => Promise<void>;
    patch: (request: Request, response: Response) => Promise<void>;
} => {
    /**
     * The one pipeline both verbs run: validate → (PUT only) fill omitted fields with `null` →
     * `update(id, changes)` → audit → respond. `schema` and `fillOmitted` are the only two things
     * that differ between `replace` and `patch` below.
     */
    const run =
        (operation: string, schema: ZodType, fillOmitted: boolean) =>
        (request: Request, response: Response): Promise<void> => {
            // `idFrom` (UpdateControllerSpec's own docblock): `/account`'s two verbs act on the
            // caller's own record, so there is no path id to 422 — skip straight to it.
            const id = idFrom
                ? idFrom(request)
                : extractAndValidateId(request, response, 'path');
            if (!id) return Promise.resolve();

            const body = parseBody(schema, request.body, response) as
                | Record<string, unknown>
                | undefined;
            if (body === undefined) return Promise.resolve();

            const changes = fillOmitted ? fillOmittedWithNull(body, writableFields) : body;

            return update(id, changes as TPatch['_output'], request)
                .then((result) => {
                    // Sends the error envelope (404, 409, 422) and stops here if refused.
                    if (refused(response, result)) return;

                    // See `UpdateControllerSpec.auditAction` — most modules already recorded
                    // their own entry inside `update()` and pass nothing here.
                    if (auditAction)
                        recordAudit(callerContextOf(request), {
                            action: auditAction,
                            outcome: 'success',
                            target_type: entity,
                            target_id: id
                        });
                    return Promise.resolve(present(result.data, request)).then((shaped) => {
                        successResponse(response, shaped, 200, result.message);
                    });
                })
                .catch(catchAsNotFound(response, operation, notFoundKey));
        };

    const replaceOperation = operationName('replace', entity);
    const patchOperation = operationName('patch', entity);

    return {
        replace: namedHandler(replaceOperation, run(replaceOperation, replaceSchema, true)),
        patch: namedHandler(patchOperation, run(patchOperation, patchSchema, false))
    };
};

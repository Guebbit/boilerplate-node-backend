import type { Request, Response } from 'express';
import {
    CreateLocaleEntryBody,
    MergeLocaleEntriesBody,
    ReplaceLocaleEntriesBody,
    UpdateLocaleEntryBody
} from '@api/schemas.zod';
import type {
    LocaleEntryInput,
    MergeLocaleEntriesRequest,
    ReplaceLocaleEntriesRequest,
    UpdateLocaleEntryRequest
} from '@types';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { localeService } from '../service';
import { localeAuditActions } from '../audit';

/**
 * The four write routes on a language's entries: one key at a time, and two bulk imports.
 *
 * ## Why both bulk routes exist, and why they are two METHODS
 *
 * Nobody types five hundred keys into a form, so without an import this admin surface is a demo.
 * And "does an import delete the keys it did not mention" is the question every translation tool
 * gets wrong — so the answer is spelled in the method rather than in a flag:
 *
 *   PUT   replaces — what is not sent is deleted
 *   PATCH merges   — what is not sent is left alone
 *
 * A client cannot ask for one and receive the other, and a mis-set boolean cannot silently empty a
 * dictionary. `tests/contract/` asserts the pair together, because this is the semantic most
 * likely to be implemented backwards.
 */

/** 422 from a Zod result, in the one shape every controller here uses. */
const rejectInvalid = (response: Response, issues: { message: string }[]) =>
    Promise.resolve(
        rejectResponse(
            response,
            422,
            issues.map(({ message }) => message)
        )
    );

/**
 * POST /locales/:locale/entries (admin)
 * Add one key.
 */
export const createLocaleEntry = (
    request: Request<{ locale: string }, unknown, LocaleEntryInput>,
    response: Response
) => {
    const parseResult = CreateLocaleEntryBody.safeParse(request.body);
    if (!parseResult.success) return rejectInvalid(response, parseResult.error.issues);

    return localeService
        .createEntry(request.params.locale, parseResult.data)
        .then((result) => {
            if (!result.success) return rejectResponse(response, result.status, result.errors);

            emitAuditEvent(
                buildAuditEvent(request, {
                    action: localeAuditActions.ADMIN_LOCALE_ENTRY_CREATED,
                    outcome: 'success',
                    target_type: 'locale_entry',
                    target_id: String(result.data?._id),
                    metadata: { locale: request.params.locale, key: parseResult.data.key }
                })
            );

            return successResponse(response, result.data, 201);
        })
        .catch((error: Error) => rejectDatabaseError(response, 'createLocaleEntry', error));
};

/**
 * PUT /locales/:locale/entries/:entryId (admin)
 * Edit one value.
 *
 * The key is not editable: it is the identity a client looks the string up by, so changing it is a
 * delete plus an add, and the two collision checks that go with them.
 */
export const updateLocaleEntry = (
    request: Request<{ locale: string; entryId: string }, unknown, UpdateLocaleEntryRequest>,
    response: Response
) => {
    const parseResult = UpdateLocaleEntryBody.safeParse(request.body);
    if (!parseResult.success) return rejectInvalid(response, parseResult.error.issues);

    return localeService
        .updateEntry(request.params.locale, request.params.entryId, parseResult.data)
        .then((result) => {
            if (!result.success) return rejectResponse(response, result.status, result.errors);

            emitAuditEvent(
                buildAuditEvent(request, {
                    action: localeAuditActions.ADMIN_LOCALE_ENTRY_UPDATED,
                    outcome: 'success',
                    target_type: 'locale_entry',
                    target_id: request.params.entryId,
                    // The key, not the new text. An audit trail records that the Spanish product
                    // title changed and who changed it; storing the copy itself would make the
                    // trail a second, unmanaged copy of the dictionary.
                    metadata: { locale: request.params.locale, key: result.data?.key }
                })
            );

            return successResponse(response, result.data);
        })
        .catch((error: Error) => rejectDatabaseError(response, 'updateLocaleEntry', error));
};

/** The two bulk routes differ by one word, so they are one handler and a mode. */
const importEntries = (
    request: Request<{ locale: string }, unknown, { entries?: LocaleEntryInput[] }>,
    response: Response,
    mode: 'replace' | 'merge',
    entries: LocaleEntryInput[]
) =>
    localeService
        .importEntries(request.params.locale, entries, mode)
        .then((result) => {
            if (!result.success) return rejectResponse(response, result.status, result.errors);

            emitAuditEvent(
                buildAuditEvent(request, {
                    action: localeAuditActions.ADMIN_LOCALE_ENTRY_IMPORTED,
                    outcome: 'success',
                    target_type: 'locale',
                    target_id: request.params.locale,
                    // `mode` is the field that makes this record worth keeping: a replace that
                    // removed three hundred keys and a merge that added two are the same action
                    // name and very different events.
                    metadata: { mode, ...result.data }
                })
            );

            return successResponse(response, result.data);
        })
        .catch((error: Error) => rejectDatabaseError(response, `${mode}LocaleEntries`, error));

/**
 * PUT /locales/:locale/entries (admin)
 * Replace the whole set — anything stored and not sent is deleted.
 */
export const replaceLocaleEntries = (
    request: Request<{ locale: string }, unknown, ReplaceLocaleEntriesRequest>,
    response: Response
) => {
    const parseResult = ReplaceLocaleEntriesBody.safeParse(request.body);
    if (!parseResult.success) return rejectInvalid(response, parseResult.error.issues);

    return importEntries(request, response, 'replace', parseResult.data.entries);
};

/**
 * PATCH /locales/:locale/entries (admin)
 * Upsert what is sent, leave the rest alone. Nothing is ever deleted by this route.
 */
export const mergeLocaleEntries = (
    request: Request<{ locale: string }, unknown, MergeLocaleEntriesRequest>,
    response: Response
) => {
    const parseResult = MergeLocaleEntriesBody.safeParse(request.body);
    if (!parseResult.success) return rejectInvalid(response, parseResult.error.issues);

    return importEntries(request, response, 'merge', parseResult.data.entries);
};

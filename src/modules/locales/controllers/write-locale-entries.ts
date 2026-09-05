/**
 * @module
 * The four write routes on a language's entries: one key at a time, plus two bulk imports.
 * The bulk routes are two methods rather than one route with a flag — PUT replaces (what
 * isn't sent is deleted), PATCH merges (what isn't sent is left alone) — so a mis-set
 * boolean can't silently empty a dictionary.
 */

import type { Request, Response } from 'express';
import {
    CreateLocaleEntryBody,
    MergeLocaleEntriesBody,
    ReplaceLocaleEntriesBody,
    UpdateLocaleEntryBody
} from '@api/schemas.zod';
import type {
    CreateLocaleEntryRequest,
    LocaleEntry,
    LocaleEntryInput,
    LocaleImportResult,
    LocaleTenant,
    MergeLocaleEntriesRequest,
    ReplaceLocaleEntriesRequest,
    UpdateLocaleEntryRequest
} from '@types';
import { refreshLocaleOverrides } from '@infrastructure/i18n';
import { successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';

/**
 * Re-read the API's own overrides after a write that may have changed them.
 * Fire-and-forget: makes the edit visible immediately on the worker that served the write,
 * others catch up on their next scheduled refresh. Called for frontend-tenant writes too,
 * even though those can't affect the overlay — cheaper than threading the tenant through.
 */
const refreshOverrides = () => void refreshLocaleOverrides();

/**
 * POST /locales/:locale/entries (admin)
 * Add one key.
 */
export const createLocaleEntry = (
    request: Request<{ locale: string }, unknown, CreateLocaleEntryRequest>,
    response: Response
) => {
    const parseResult = CreateLocaleEntryBody.safeParse(request.body);
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return localeService
        .createEntry(request.params.locale, parseResult.data, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            // A success result for this endpoint always carries the created entry; this satisfies
            // the type checker without loosening it.
            if (!result.data) throw new Error('locale entry create succeeded without an entry');

            refreshOverrides();

            // `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform: the
            // document is typed as stored, not as the wire shape `LocaleEntry` promises.
            return successResponse<LocaleEntry>(response, result.data.toJSON() as LocaleEntry, 201);
        })
        .catch(catchAs(response, 'createLocaleEntry'));
};

/**
 * PUT /locales/:locale/entries/:entryId (admin)
 * Edit one value. The key is not editable — it's the identity a client looks the string
 * up by, so changing it is a delete plus an add, not an update.
 */
export const updateLocaleEntry = (
    request: Request<{ locale: string; entryId: string }, unknown, UpdateLocaleEntryRequest>,
    response: Response
) => {
    const parseResult = UpdateLocaleEntryBody.safeParse(request.body);
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return localeService
        .updateEntry(
            request.params.locale,
            request.params.entryId,
            parseResult.data,
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) return;

            // A success result for this endpoint always carries the saved entry; this satisfies
            // the type checker without loosening it.
            if (!result.data) throw new Error('locale entry update succeeded without an entry');

            refreshOverrides();

            // `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform.
            return successResponse<LocaleEntry>(response, result.data.toJSON() as LocaleEntry);
        })
        .catch(catchAs(response, 'updateLocaleEntry'));
};

/** The two bulk routes differ by one word, so they are one handler and a mode. */
const importEntries = (
    request: Request<{ locale: string }, unknown, { entries?: LocaleEntryInput[] }>,
    response: Response,
    mode: 'replace' | 'merge',
    tenant: LocaleTenant,
    entries: LocaleEntryInput[]
) =>
    localeService
        .importEntries(request.params.locale, tenant, entries, mode, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            // A success result for this endpoint always carries the import counts; this satisfies
            // the type checker without loosening it.
            if (!result.data) throw new Error('locale entry import succeeded without a result');

            refreshOverrides();

            return successResponse<LocaleImportResult>(response, result.data);
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
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return importEntries(
        request,
        response,
        'replace',
        parseResult.data.tenant,
        parseResult.data.entries
    );
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
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return importEntries(
        request,
        response,
        'merge',
        parseResult.data.tenant,
        parseResult.data.entries
    );
};

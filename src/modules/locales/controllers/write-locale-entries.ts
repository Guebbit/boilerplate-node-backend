/**
 * @module
 * The write routes on a language's entries: one key at a time, plus two bulk imports. The tenant is
 * a path segment (`/locales/:locale/tenants/:tenant/entries`), so a PUT replaces exactly what the
 * GET on the same URI lists. The bulk routes are two methods rather than one route with a flag —
 * PUT replaces (what isn't sent is deleted), PATCH merges (what isn't sent is left alone) — so a
 * mis-set boolean can't silently empty a dictionary.
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
    MergeLocaleEntriesRequest,
    ReplaceLocaleEntriesRequest,
    UpdateLocaleEntryRequest
} from '@types';
import { successResponse, createdResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { localeService } from '../services';
import { presentLocaleEntry } from '../presenters';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';

/**
 * POST /locales/:locale/tenants/:tenant/entries (admin)
 * Add one key to the tenant's dictionary.
 */
export const createLocaleEntry = (
    request: Request<{ locale: string; tenant: string }, unknown, CreateLocaleEntryRequest>,
    response: Response
) => {
    const parseResult = CreateLocaleEntryBody.safeParse(request.body);
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return localeService
        .createEntry(
            request.params.locale,
            request.params.tenant,
            parseResult.data,
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) return;

            const entry = presentLocaleEntry(result.data);
            return createdResponse<LocaleEntry>(
                response,
                entry,
                `/locales/${request.params.locale}/entries/${entry.id}`
            );
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
    const entryId = requireId(request, response, {
        notFound: 'locales.error-entry-not-found',
        name: 'entryId'
    });
    if (!entryId) return;

    const parseResult = UpdateLocaleEntryBody.safeParse(request.body);
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return localeService
        .updateEntry(request.params.locale, entryId, parseResult.data, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            return successResponse<LocaleEntry>(response, presentLocaleEntry(result.data));
        })
        .catch(catchAs(response, 'updateLocaleEntry'));
};

/** The two bulk routes differ by one word, so they are one handler and a mode. */
const importEntries = (
    request: Request<{ locale: string; tenant: string }, unknown, { entries?: LocaleEntryInput[] }>,
    response: Response,
    mode: 'replace' | 'merge',
    entries: LocaleEntryInput[]
) =>
    localeService
        .importEntries(
            request.params.locale,
            request.params.tenant,
            entries,
            mode,
            callerContextOf(request)
        )
        .then((result) => {
            if (refused(response, result)) return;

            return successResponse<LocaleImportResult>(response, result.data);
        })
        .catch(catchAs(response, `${mode}LocaleEntries`));

/**
 * PUT /locales/:locale/tenants/:tenant/entries (admin)
 * Replace the tenant's whole set — anything stored under it and not sent is deleted.
 */
export const replaceLocaleEntries = (
    request: Request<{ locale: string; tenant: string }, unknown, ReplaceLocaleEntriesRequest>,
    response: Response
) => {
    const parseResult = ReplaceLocaleEntriesBody.safeParse(request.body);
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return importEntries(request, response, 'replace', parseResult.data.entries);
};

/**
 * PATCH /locales/:locale/tenants/:tenant/entries (admin)
 * Upsert what is sent, leave the rest alone. Nothing is ever deleted by this route.
 */
export const mergeLocaleEntries = (
    request: Request<{ locale: string; tenant: string }, unknown, MergeLocaleEntriesRequest>,
    response: Response
) => {
    const parseResult = MergeLocaleEntriesBody.safeParse(request.body);
    if (!parseResult.success) return rejectValidation(response, parseResult.error);

    return importEntries(request, response, 'merge', parseResult.data.entries);
};

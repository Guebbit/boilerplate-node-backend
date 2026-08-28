/**
 * The language rows — registering one, editing it, and removing it with everything under it.
 *
 * Also the home of the rules the other files share: a language nobody has registered, and BOTH
 * halves of what an unknown tenant means — refused on a write, dropped on a read.
 */

import {
    LocaleDirection,
    type CreateLocaleRequest,
    type LocaleTenant,
    type UpdateLocaleRequest
} from '@types';
import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import type { LocaleDocument } from '../model';
import { localeRepository } from '../repository';
import { isKnownTenant } from '../tenants';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { localeAuditActions } from '../audit';

/** Not found, phrased the one way every route in this module phrases it. */
export const languageNotFound = (): ResponseReject =>
    generateReject(404, [t('locales.error-language-not-found')]);

/** A tenant this deployment does not know — refused before anything is written under it. */
export const rejectUnknownTenant = (tenant: string): ResponseReject | undefined =>
    isKnownTenant(tenant)
        ? undefined
        : generateReject(422, [t('locales.error-tenant-unknown', { tenant })]);

/**
 * The same question asked by a READ: a tenant filter, with an unrecognised id dropped rather than
 * refused.
 *
 * Writes are strict and reads are lenient, and the two live beside each other because the
 * asymmetry is a decision rather than an accident — split across two layers it read as one of them
 * having been forgotten:
 *
 * - A WRITE NAMES the keyspace its row lands in. A tenant nobody serves would store copy no client
 *   can ever ask for, invisible until someone goes looking for a translation that was saved and
 *   never shown, so {@link rejectUnknownTenant} refuses it at 422 before anything is written.
 * - A READ only NARROWS a listing, and a filter matching nothing shows a translator an empty
 *   screen that blames the data. Dropping it shows every tenant, which is what the parameter
 *   defaults to anyway — the same answer `text=` and every other optional filter gives. A 422
 *   here would also make a stale admin screen, still holding a tenant since removed from the
 *   environment, unable to list anything at all.
 *
 * @param tenant - whatever arrived on the query string, unvalidated
 * @returns the tenant to filter by, or `undefined` for "every tenant"
 */
export const readableTenant = (tenant?: string): LocaleTenant | undefined =>
    tenant && isKnownTenant(tenant) ? tenant : undefined;

/**
 * Register a language in the dynamic tier.
 * @param context - caller context for the `ADMIN_LOCALE_CREATED` audit emit; omitted by tests
 *   that call this as a plain helper — no context means no emit
 */
export const createLanguage = async (
    payload: CreateLocaleRequest,
    context?: CallerContext
): Promise<ResponseSuccess<LocaleDocument> | ResponseReject> => {
    const tag = payload.tag.trim().toLowerCase();

    // Checked here for the message, and by a unique index for the race — a concurrent creation of
    // the same tag reaches E11000, which the shared interpreter answers 409 for anyway.
    if (await localeRepository.findByTag(tag))
        return generateReject(409, [t('locales.error-language-exists', { tag })]);

    const language = await localeRepository.create({
        tag,
        name: payload.name.trim(),
        nativeName: payload.nativeName.trim(),
        direction: payload.direction ?? LocaleDirection.ltr,
        active: payload.active ?? true
    } as Partial<LocaleDocument>);

    if (context)
        emitAuditEvent(
            buildAuditEvent(context, {
                action: localeAuditActions.ADMIN_LOCALE_CREATED,
                outcome: 'success',
                target_type: 'locale',
                target_id: tag,
                metadata: { active: language.active }
            })
        );

    return generateSuccess(language, 201);
};

/**
 * Edit a language's display fields or its visibility.
 *
 * `undefined` means "leave it alone", which is why each field is tested rather than assigned: a
 * blanket assign would turn a request that changed one field into one that cleared the other three.
 */
export const updateLanguage = async (
    tag: string,
    payload: UpdateLocaleRequest,
    context?: CallerContext
): Promise<ResponseSuccess<LocaleDocument> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    if (payload.name !== undefined) language.name = payload.name.trim();
    if (payload.nativeName !== undefined) language.nativeName = payload.nativeName.trim();
    if (payload.direction !== undefined) language.direction = payload.direction;
    if (payload.active !== undefined) language.active = payload.active;

    const saved = await localeRepository.save(language);

    if (context)
        emitAuditEvent(
            buildAuditEvent(context, {
                action: localeAuditActions.ADMIN_LOCALE_UPDATED,
                outcome: 'success',
                target_type: 'locale',
                target_id: tag,
                // The visibility flag is the field worth having in the trail on its own: it is
                // what makes a half-finished translation public, and the only edit here that
                // changes what an anonymous caller can see.
                metadata: { active: saved.active }
            })
        );

    return generateSuccess(saved);
};

/**
 * Remove a language and everything translated into it.
 *
 * Refuses while the language is still active. The two-step is the whole safeguard: this destroys
 * work that took a person days, and an accidental `DELETE` should cost a toggle rather than the
 * work. Deactivating first is a state an admin has a reason to use anyway, so the guard asks for
 * nothing artificial.
 */
export const deleteLanguage = async (
    tag: string,
    context?: CallerContext
): Promise<ResponseSuccess<{ removedEntries: number }> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    if (language.active) return generateReject(409, [t('locales.error-language-active')]);

    const removedEntries = await localeRepository.deleteLocaleCascade(language);

    if (context)
        emitAuditEvent(
            buildAuditEvent(context, {
                action: localeAuditActions.ADMIN_LOCALE_DELETED,
                outcome: 'success',
                target_type: 'locale',
                target_id: tag,
                metadata: { removedEntries }
            })
        );

    return generateSuccess({ removedEntries });
};

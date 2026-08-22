/**
 * The language rows — registering one, editing it, and removing it with everything under it.
 *
 * Also the home of the two rejections the other files share: a language nobody has registered and
 * a tenant this deployment does not know.
 */

import { LocaleDirection, type CreateLocaleRequest, type UpdateLocaleRequest } from '@types';
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

/** Not found, phrased the one way every route in this module phrases it. */
export const languageNotFound = (): ResponseReject =>
    generateReject(404, [t('locales.error-language-not-found')]);

/** A tenant this deployment does not know — refused before anything is written under it. */
export const rejectUnknownTenant = (tenant: string): ResponseReject | undefined =>
    isKnownTenant(tenant)
        ? undefined
        : generateReject(422, [t('locales.error-tenant-unknown', { tenant })]);

/** Register a language in the dynamic tier. */
export const createLanguage = async (
    payload: CreateLocaleRequest
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
    payload: UpdateLocaleRequest
): Promise<ResponseSuccess<LocaleDocument> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    if (payload.name !== undefined) language.name = payload.name.trim();
    if (payload.nativeName !== undefined) language.nativeName = payload.nativeName.trim();
    if (payload.direction !== undefined) language.direction = payload.direction;
    if (payload.active !== undefined) language.active = payload.active;

    return generateSuccess(await localeRepository.save(language));
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
    tag: string
): Promise<ResponseSuccess<{ removedEntries: number }> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    if (language.active) return generateReject(409, [t('locales.error-language-active')]);

    return generateSuccess({
        removedEntries: await localeRepository.deleteLocaleCascade(language)
    });
};

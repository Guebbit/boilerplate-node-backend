/**
 * @module
 * The language rows — registering one, editing it, and removing it with everything under it. Also
 * the home of the rule the other files share: a language nobody has registered, and what an
 * unknown app means on a write — refused, since it would store invisible copy. A read narrowed
 * by an unknown app needs no such rule: filtering by an id nothing was ever written under
 * already answers an empty page on its own.
 */

import { LocaleDirection, type CreateLocaleRequest, type UpdateLocaleRequest } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { getFallbackLocale, t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { normalizeTag, type LocaleDocument } from '../model';
import { localeRepository } from '../repository';
import { isKnownApp } from '../apps';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { localeAuditActions } from '../audit';
import { refreshOverlayNow } from './overlay';
import { translatableCacheTags } from './translatables';
import { invalidateCacheTagsLogged } from '@infrastructure/adapters/cache';

/**
 * Drops every cached response that may carry translated entity text — what a language switching on
 * or off, or being deleted, changes without any entity being written.
 */
const clearTranslatableCaches = (): Promise<void> =>
    invalidateCacheTagsLogged(translatableCacheTags());

/** Not found, phrased the one way every route in this module phrases it. */
export const languageNotFound = (): ResponseReject =>
    generateReject(404, [
        {
            code: ERROR_CODES.LOCALE_LANGUAGE_NOT_FOUND,
            message: t('locales.error-language-not-found')
        }
    ]);

/**
 * The deployment's fallback locale, deactivated or deleted — refused before either happens.
 * Every translatable entity's source row lives there; losing it empties the catalogue in every
 * language at once, so the guard sits here rather than trusting an operator to know that.
 */
const rejectFallbackLocale = (tag: string): ResponseReject | undefined =>
    tag === getFallbackLocale()
        ? generateReject(409, [
              {
                  code: ERROR_CODES.LOCALE_LANGUAGE_IS_FALLBACK,
                  message: t('locales.error-language-is-fallback')
              }
          ])
        : undefined;

/** An app this deployment does not know — refused before anything is written under it. */
export const rejectUnknownApp = (app: string): ResponseReject | undefined =>
    isKnownApp(app)
        ? undefined
        : generateReject(422, [
              {
                  code: ERROR_CODES.LOCALE_APP_UNKNOWN,
                  message: t('locales.error-app-unknown', { app })
              }
          ]);

/**
 * Register a language in the dynamic tier.
 * @param context - caller context for the `ADMIN_LOCALE_CREATED` audit emit; omitted by tests
 *   that call this as a plain helper — no context means no emit
 */
export const createLanguage = (
    payload: CreateLocaleRequest,
    context?: CallerContext
): Promise<ResponseSuccess<LocaleDocument> | ResponseReject> => {
    const tag = normalizeTag(payload.tag);

    // Checked here for the message, and by a unique index for the race — a concurrent creation of
    // the same tag reaches E11000, which the shared interpreter answers 409 for anyway.
    return localeRepository.findByTag(tag).then((existing) => {
        if (existing)
            return generateReject(409, [
                {
                    code: ERROR_CODES.LOCALE_LANGUAGE_EXISTS,
                    message: t('locales.error-language-exists', { tag })
                }
            ]);

        return localeRepository
            .create({
                tag,
                name: payload.name.trim(),
                nativeName: payload.nativeName.trim(),
                direction: payload.direction ?? LocaleDirection.ltr,
                active: payload.active ?? true
            })
            .then((language) => {
                recordAudit(context, {
                    action: localeAuditActions.ADMIN_LOCALE_CREATED,
                    outcome: 'success',
                    targetType: 'locale',
                    targetId: tag,
                    metadata: { active: language.active }
                });

                return refreshOverlayNow().then(() => generateSuccess(language, 201));
            });
    });
};

/**
 * Edit a language's display fields.
 *
 * `undefined` means "leave it alone", which is why each field is tested rather than assigned: a
 * blanket assign would turn a request that changed one field into one that cleared the other two.
 * Whether the language is switched on is not editable here — {@link activateLanguage} and
 * {@link deactivateLanguage} own that, with its refusals, cache clear and audit row.
 */
export const updateLanguage = (
    tag: string,
    payload: UpdateLocaleRequest,
    context?: CallerContext
): Promise<ResponseSuccess<LocaleDocument> | ResponseReject> =>
    localeRepository.findByTag(tag).then((language) => {
        if (!language) return languageNotFound();

        if (payload.name !== undefined) language.name = payload.name.trim();
        if (payload.nativeName !== undefined) language.nativeName = payload.nativeName.trim();
        if (payload.direction !== undefined) language.direction = payload.direction;

        return localeRepository.save(language).then((saved) => {
            recordAudit(context, {
                action: localeAuditActions.ADMIN_LOCALE_UPDATED,
                outcome: 'success',
                targetType: 'locale',
                targetId: tag,
                // Field names only: a display name is free text, and the trail is not a second
                // copy of it.
                metadata: { changedFields: Object.keys(payload).toSorted() }
            });

            // The negotiation reads an in-memory list of the served languages, refreshed by
            // this: an edit must reach this worker's next request, not wait for the timer.
            return refreshOverlayNow().then(() => generateSuccess(saved));
        });
    });

/**
 * Switches a language on or off — the one place `active` changes after creation.
 *
 * Refuses a move to the state it is already in (409, an action endpoint never succeeds silently)
 * and switching the fallback off. Cached translated text is keyed by language and kept for an hour:
 * switching a language off must not leave its text served, nor switching it on leave the fallback
 * served in its place.
 *
 * @param active - the state to move to
 */
const setActive = (
    tag: string,
    active: boolean,
    context?: CallerContext
): Promise<ResponseSuccess<LocaleDocument> | ResponseReject> =>
    localeRepository.findByTag(tag).then((language) => {
        if (!language) return languageNotFound();

        if (language.active === active)
            return generateReject(409, [
                {
                    code: active
                        ? ERROR_CODES.LOCALE_LANGUAGE_ALREADY_ACTIVE
                        : ERROR_CODES.LOCALE_LANGUAGE_ALREADY_INACTIVE,
                    message: t(
                        active
                            ? 'locales.error-language-already-active'
                            : 'locales.error-language-already-inactive',
                        { tag }
                    )
                }
            ]);

        const fallbackRefusal = active ? undefined : rejectFallbackLocale(tag);
        if (fallbackRefusal) return fallbackRefusal;

        language.active = active;

        return localeRepository
            .save(language)
            .then((saved) => clearTranslatableCaches().then(() => saved))
            .then((saved) => {
                recordAudit(context, {
                    action: active
                        ? localeAuditActions.ADMIN_LOCALE_ACTIVATED
                        : localeAuditActions.ADMIN_LOCALE_DEACTIVATED,
                    outcome: 'success',
                    targetType: 'locale',
                    targetId: tag
                });

                // Same as an edit: this worker's served-language list follows at once.
                return refreshOverlayNow().then(() => generateSuccess(saved));
            });
    });

/**
 * Switch a language on.
 * @param context - caller context for the `ADMIN_LOCALE_ACTIVATED` audit emit
 */
export const activateLanguage = (tag: string, context?: CallerContext) =>
    setActive(tag, true, context);

/**
 * Switch a language off. The fallback language refuses.
 * @param context - caller context for the `ADMIN_LOCALE_DEACTIVATED` audit emit
 */
export const deactivateLanguage = (tag: string, context?: CallerContext) =>
    setActive(tag, false, context);

/**
 * Remove a language and everything translated into it.
 *
 * Refuses while still active — the two-step is the whole safeguard: this destroys days of work,
 * and an accidental `DELETE` should cost a toggle first, not the work itself.
 */
export const removeLanguage = (
    tag: string,
    context?: CallerContext
): Promise<
    ResponseSuccess<{ removedEntries: number; removedTranslations: number }> | ResponseReject
> =>
    localeRepository.findByTag(tag).then((language) => {
        if (!language) return languageNotFound();

        if (language.active)
            return generateReject(409, [
                {
                    code: ERROR_CODES.LOCALE_LANGUAGE_ACTIVE,
                    message: t('locales.error-language-active')
                }
            ]);

        const fallbackRefusal = rejectFallbackLocale(tag);
        if (fallbackRefusal) return fallbackRefusal;

        return localeRepository
            .deleteLocaleCascade(language)
            .then(({ entries: removedEntries, translations: removedTranslations }) =>
                // The cascade removed the language's product text: cached responses still hold it.
                clearTranslatableCaches().then(() => ({ removedEntries, removedTranslations }))
            )
            .then(({ removedEntries, removedTranslations }) => {
                recordAudit(context, {
                    action: localeAuditActions.ADMIN_LOCALE_DELETED,
                    outcome: 'success',
                    targetType: 'locale',
                    targetId: tag,
                    metadata: { removedEntries, removedTranslations }
                });

                return refreshOverlayNow().then(() =>
                    generateSuccess({ removedEntries, removedTranslations })
                );
            });
    });

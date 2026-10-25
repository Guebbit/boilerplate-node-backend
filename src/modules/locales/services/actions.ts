/**
 * @module
 * What a caller may do to a language, decided here so no client re-derives the rules. The state
 * half (is it on, is it the fallback) and the caller half (the two keys) meet in
 * {@link languageActions}; the presenter only maps the finished block.
 */

import { holds } from '@kernel/ability';
import { hasAnonymousReadScope } from '@kernel/access/query';
import { getFallbackLocale } from '@infrastructure/i18n';
import {
    LanguageDeleteBlockedReason,
    type Caller,
    type LanguageActions,
    type Language
} from '@types';

/** Which of the two language keys a caller holds. */
export interface LanguageStanding {
    /** The caller holds `update:Locale`. */
    update: boolean;
    /** The caller holds `delete:Locale`. */
    delete: boolean;
}

/** The standing of a caller who holds neither key: every flag derived from it is `false`. */
export const NO_STANDING: LanguageStanding = { update: false, delete: false };

/**
 * The caller's standing, from the keys they hold.
 *
 * @param caller - `request.caller`, or `undefined` for an anonymous request
 */
export const standingOn = (caller?: Caller): LanguageStanding =>
    caller
        ? { update: holds(caller, 'update', 'Locale'), delete: holds(caller, 'delete', 'Locale') }
        : NO_STANDING;

/**
 * The standing to put on a READ of the manifest.
 *
 * A caller whose read scope is the anonymous one is answered from the cache shared with every
 * guest, so a flag set for them would be served to strangers. Only a caller outside that scope
 * (`display:Locale`) is answered fresh, and only they get a standing.
 *
 * @param scopeOf - the module's read scope, `callerScope`
 * @param caller - `request.caller`, or `undefined` for an anonymous request
 */
export const standingOnRead = (
    scopeOf: (caller?: Caller) => Record<string, unknown>,
    caller?: Caller
): LanguageStanding => (hasAnonymousReadScope(scopeOf, caller) ? NO_STANDING : standingOn(caller));

/** What a language with no registered row can do: nothing, its deployed file has no off switch. */
export const NO_ACTIONS: LanguageActions = {
    update: false,
    activate: false,
    deactivate: false,
    delete: false
};

/**
 * What the caller may do to one registered language.
 *
 * @param language - the language's tag and whether it is switched on
 * @param standing - how the caller stands to the two keys
 * @returns every flag, plus `deleteBlocked` when a caller allowed to delete could not yet
 */
export const languageActions = (
    language: Pick<Language, 'tag' | 'active'>,
    standing: LanguageStanding
): LanguageActions => {
    const isFallback = language.tag === getFallbackLocale();
    const canDelete = standing.delete && !isFallback;

    return {
        update: standing.update,
        activate: standing.update && !language.active,
        deactivate: standing.update && language.active && !isFallback,
        delete: canDelete,
        // A caller who cannot delete at all is not told why a button is missing.
        ...(standing.delete && isFallback
            ? { deleteBlocked: LanguageDeleteBlockedReason.fallback }
            : {})
    };
};

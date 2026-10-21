/**
 * @module
 * Request-scoped translation: the ambient `t`, and the storage that carries it. `i18next`'s
 * default export is one global instance with one active language, so two overlapping requests in
 * different languages would interleave without this — `getFixedT(locale)` binds a `t` per
 * language, and `AsyncLocalStorage` carries it down the request's async chain. Out-of-band work
 * (queues, boot-time callbacks) falls outside that chain and must bind explicitly with
 * {@link runWithLocale}.
 *
 * See: docs/tools/i18n.md
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import i18next from 'i18next';
import type { TFunction } from 'i18next';
import { getDefaultLocale } from './catalog';
import { dictionaryLocaleFor, servedLocaleFor } from './served';

/**
 * What a request carries: the negotiated locale and a `t` bound to it.
 */
export interface LocaleContext {
    /** BCP-47 locale this context is bound to. */
    locale: string;
    /** `t` already bound to `locale`. */
    t: TFunction;
}

/** The ambient store: whichever {@link LocaleContext} is bound to the current async call chain. */
const localeStorage = new AsyncLocalStorage<LocaleContext>();

/**
 * A `t` bound to one language, touching no global and no ambient store.
 *
 * The primitive the rest of this file is built on, and the one to reach for when the language is
 * known but the caller is not on the request's async chain: `emails.ts` builders resolving copy
 * for a recipient whose language is not the requester's, for instance.
 *
 * A language the API has no wording of its own for — a registered language with no deployed file,
 * or one switched off since the recipient saved it — is bound to the fallback language: the same
 * words a missing key falls back to, and no `supportedLngs` rejection logged on every call.
 */
export const translator = (locale: string): TFunction =>
    i18next.getFixedT(dictionaryLocaleFor(locale));

/**
 * Binds a `t` to one language without touching the global instance.
 *
 * The context's `locale` is what product text is read in and what `Content-Language` says, so a
 * language that is not served (unregistered, or switched off — also later, for a saved user
 * language) never becomes one: it is the fallback language instead. A regional tag follows its
 * base language, and a served language without a dictionary file keeps its own `locale`, and only
 * its `t` falls back, see {@link translator}.
 */
export const createLocaleContext = (locale: string): LocaleContext => {
    const served = servedLocaleFor(locale);
    return { locale: served, t: translator(served) };
};

/**
 * Runs `callback` — and everything it awaits, however deep — with `context` as the ambient locale.
 */
export const runWithLocaleContext = <T>(context: LocaleContext, callback: () => T): T =>
    localeStorage.run(context, callback);

/**
 * Convenience wrapper for code that has a locale string rather than a context: workers draining a
 * queue, jobs acting on a user's behalf, tests.
 */
export const runWithLocale = <T>(locale: string, callback: () => T): T =>
    runWithLocaleContext(createLocaleContext(locale), callback);

/**
 * The ambient context, or `undefined` outside a request.
 */
export const getLocaleContext = (): LocaleContext | undefined => localeStorage.getStore();

/**
 * The locale in effect right now: the request's, or the instance's boot language.
 */
export const getCurrentLocale = (): string =>
    localeStorage.getStore()?.locale ??
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- i18next types `language` as `string`, but it is `undefined` until `init` has run
    (i18next.language as string | undefined) ??
    getDefaultLocale();

/**
 * The ambient `t`: the request's bound version when there is one, the global instance's otherwise.
 *
 * Same signature as `i18next`'s own `t`, so repointing an import is the whole migration — the cast
 * is unavoidable since `TFunction`'s overloads can't be satisfied by a single arrow.
 */
export const t = ((...arguments_: Parameters<TFunction>) =>
    (localeStorage.getStore()?.t ?? i18next.t)(...arguments_)) as TFunction;

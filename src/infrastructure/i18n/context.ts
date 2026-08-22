/**
 * Request-scoped translation: the ambient `t`, and the storage that carries it.
 *
 * The concurrency-critical part of i18n, and the reason it is fifty lines on its own. `i18next`'s
 * default export is one global instance with one active language, so two overlapping requests in
 * different languages interleave and one is answered in the other's — a bug that only appears
 * under concurrency, so never in a test and always in production. `getFixedT(locale)` binds a `t`
 * to one language and touches no global; an `AsyncLocalStorage` carries it down the request's
 * async chain.
 *
 * ALS is scoped to an async CALL CHAIN. Queued work, boot-time callbacks and scripts all run
 * outside the store and fall back to the boot locale — out-of-band work must carry its locale in
 * the payload and bind with {@link runWithLocale}.
 *
 * See: docs/tools/i18n.md
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import i18next from 'i18next';
import type { TFunction } from 'i18next';
import { getDefaultLocale } from './catalog';

/**
 * What a request carries: the negotiated locale and a `t` bound to it.
 */
export interface LocaleContext {
    locale: string;
    t: TFunction;
}

const localeStorage = new AsyncLocalStorage<LocaleContext>();

/**
 * A `t` bound to one language, touching no global and no ambient store.
 *
 * The primitive the rest of this file is built on, and the one to reach for when the language is
 * known but the caller is not on the request's async chain: `emails.ts` builders resolving copy
 * for a recipient whose language is not the requester's, for instance.
 */
export const translator = (locale: string): TFunction => i18next.getFixedT(locale);

/**
 * Binds a `t` to one language without touching the global instance.
 */
export const createLocaleContext = (locale: string): LocaleContext => ({
    locale,
    t: translator(locale)
});

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
    (i18next.language as string | undefined) ??
    getDefaultLocale();

/**
 * The ambient `t`.
 *
 * Reads the request's bound `t` when there is one and the global instance's otherwise. Same
 * signature as `i18next`'s own `t`, so repointing an import is the whole migration — the cast is
 * unavoidable because `TFunction` is a union of overloads that no single arrow can satisfy
 * structurally, and it is safe because the arguments are forwarded untouched.
 */
export const t = ((...arguments_: Parameters<TFunction>) =>
    (localeStorage.getStore()?.t ?? i18next.t)(...arguments_)) as TFunction;

/**
 * @module
 * The two places this module's documents become wire shapes — one per resource, since locales
 * serves both a language and its entries. `services/entries.ts`'s `search()` already answers with
 * `LocaleEntry` straight off the repository's own lean transform; only a single-document write
 * needs the cast these presenters replace.
 */

import type { Language, LocaleEntry } from '@types';
import type { LocaleDocument, LocaleEntryDocument } from './model';

/**
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform: the document is
 * typed as stored, not as the wire shape `Language` promises.
 */
export const presentLocale = (document: LocaleDocument): Language => document.toJSON() as Language;

/**
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform: the document is
 * typed as stored, not as the wire shape `LocaleEntry` promises.
 */
export const presentLocaleEntry = (document: LocaleEntryDocument): LocaleEntry =>
    document.toJSON() as LocaleEntry;

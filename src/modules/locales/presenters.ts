/**
 * @module
 * Where an entry document becomes its wire shape. A language needs no presenter: its wire shape
 * merges both tiers, so `localeService.describeStoredLanguage` builds it. `services/entries.ts`'s
 * `search()` already answers with `LocaleEntry` straight off the repository's own lean transform;
 * only a single-document write needs the cast this presenter replaces.
 */

import type { LocaleEntry } from '@types';
import type { LocaleEntryDocument } from './model';

/**
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform: the document is
 * typed as stored, not as the wire shape `LocaleEntry` promises.
 */
export const presentLocaleEntry = (document: LocaleEntryDocument): LocaleEntry =>
    document.toJSON() as LocaleEntry;

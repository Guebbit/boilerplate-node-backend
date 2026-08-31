/**
 * @module
 * How a language fixture and an entry fixture are built.
 *
 * Two factories, because the two collections are addressed differently: a language is a record
 * with a pinned `_id` like any other, and an entry is identified by the pair `(locale, key)` — its
 * own id is an addressing detail rather than a fact about it. Both pin an id anyway so the
 * exported dataset is byte-stable across runs; see `@infrastructure/persistence/fixtures` for why
 * that is a determinism requirement and not a convenience.
 *
 * Every field a fixture does not state is left to `./model`'s `default:`, which is what keeps
 * `db/demo/demo-data.json` a record of what the SCHEMA does rather than of what a fixture guessed
 * it does.
 */

import type { Types } from 'mongoose';
import { identityOf, compact, type OverridesFor } from '@infrastructure/persistence/fixtures';
import type { Language, LocaleEntry } from '@types';
import { deriveBaseLanguage } from './model';
import type { LocaleDocument, LocaleMessageDocument } from './model';

/** The fields `makeLocale` accepts, overriding what the schema would otherwise default. */
export type LocaleOverrides = OverridesFor<Language> & {
    /** BCP 47. Lowercased by the schema on write, so a fixture may state it either way. */
    tag: string;
};

/**
 * A language ready for `localeRepository.create`.
 *
 * `_id` and `tag` are required rather than optional: the id is what `upsertById` addresses the
 * fixture by, and the tag is what every entry references. Both are always set, so declaring them
 * optional would only force a `!` at each call site.
 */
export type LocaleFixture = Partial<LocaleDocument> & {
    _id: Types.ObjectId;
    tag: string;
};

/** Builds a language fixture, deriving `baseLanguage` the same way `createLanguage` does. */
export const makeLocale = ({
    id,
    createdAt,
    updatedAt,
    ...fields
}: LocaleOverrides): LocaleFixture => ({
    ...identityOf({ id, createdAt, updatedAt }),
    name: fields.tag,
    nativeName: fields.tag,
    // Derived, exactly as `createLanguage` derives it: a fixture that stated its own could
    // publish a dataset the API can never produce.
    baseLanguage: deriveBaseLanguage(fields.tag),
    ...compact({ ...fields })
});

/** The fields `makeLocaleEntry` accepts, overriding what the schema would otherwise default. */
export type LocaleEntryOverrides = OverridesFor<LocaleEntry> & {
    locale: string;
    key: string;
};

/** One translated string, ready for `localeMessageRepository.create`. */
export type LocaleEntryFixture = Partial<LocaleMessageDocument> & {
    _id: Types.ObjectId;
    locale: string;
    key: string;
};

/** Builds one translated-string fixture. */
export const makeLocaleEntry = ({
    id,
    createdAt,
    updatedAt,
    ...fields
}: LocaleEntryOverrides): LocaleEntryFixture => ({
    ...identityOf({ id, createdAt, updatedAt }),
    ...compact({ ...fields })
});

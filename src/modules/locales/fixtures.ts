/**
 * @module
 * How a language fixture and an entry fixture are built. Two factories, since the
 * collections are addressed differently — a language by a pinned `_id`, an entry by the
 * pair `(locale, key)` — though both pin an id for a byte-stable exported dataset. Fields
 * a fixture doesn't state fall to `./model`'s `default:`, keeping `demo-data.json` a
 * record of the schema, not of a fixture's guess.
 */

import type { Types } from 'mongoose';
import {
    identityOf,
    stripUndefined,
    type OverridesFor
} from '@infrastructure/persistence/fixtures';
import type { Language, LocaleEntry } from '@types';
import { deriveBaseLanguage } from './model';
import type { LocaleDocument, LocaleEntryDocument } from './model';

/** The fields `makeLocale` accepts, overriding what the schema would otherwise default. */
export type LocaleOverrides = OverridesFor<Language> & {
    /** BCP 47. Lowercased by the schema on write, so a fixture may state it either way. */
    tag: string;
};

/**
 * A language ready for `localeRepository.create`. `_id` and `tag` are required, not
 * optional: `upsertById` addresses the fixture by id, and every entry references the tag.
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
    ...stripUndefined({ ...fields })
});

/** The fields `makeLocaleEntry` accepts, overriding what the schema would otherwise default. */
export type LocaleEntryOverrides = OverridesFor<LocaleEntry> & {
    locale: string;
    key: string;
};

/** One translated string, ready for `localeEntryRepository.create`. */
export type LocaleEntryFixture = Partial<LocaleEntryDocument> & {
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
    ...stripUndefined({ ...fields })
});

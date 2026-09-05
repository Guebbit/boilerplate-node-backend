/**
 * @module
 * The two collections behind the OVERRIDE tier — both dictionaries' runtime edits. Nothing here is
 * ever AWAITED on the request path: `t()` reaches the backend tenant's rows only through an
 * overlay `@infrastructure/i18n` rebuilds at boot, on a timer, and after a write. Mongo down or a
 * malformed key costs only that overlay going stale, never a request failing to resolve its own
 * copy. See `openapi.yaml` for the tier split.
 */

import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { LocaleDirection } from '@types';
import type { Language, LocaleEntry } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * The ISO 639-1 primary subtag of a BCP 47 tag: `pt-BR` → `pt`, `es` → `es`.
 *
 * Lowercased here as well as by the schema, because the seeds and the migration call it directly
 * and neither goes through a Mongoose setter.
 */
export const deriveBaseLanguage = (tag: string): string =>
    // `split` always yields at least one element, so index 0 needs no fallback arm.
    tag.split('-')[0].trim().toLowerCase();

/** Mongoose document type for a registered language. Overrides the generated `Language`'s dates. */
export interface LocaleDocument extends Omit<Language, 'id' | 'createdAt' | 'updatedAt'>, Document {
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose document type for one translated string. */
export interface LocaleEntryDocument
    extends Omit<LocaleEntry, 'id' | 'createdAt' | 'updatedAt'>, Document {
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose model type for the languages collection. */
export type LocaleModel = Model<LocaleDocument>;

/** Mongoose model type for the entries collection. */
export type LocaleEntryModel = Model<LocaleEntryDocument>;

/** The languages. */
export const localeSchema = new Schema<LocaleDocument, LocaleModel>(
    {
        /*
         * Lowercased on write, because BCP 47 is case-insensitive and Mongo is not: `pt-BR` and
         * `pt-br` are one language and must not be two rows. The unique index below is what makes
         * that a database guarantee rather than a hope, and it can only compare bytes.
         */
        tag: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        /*
         * The ISO 639-1 code at the front of `tag`, kept as its own column and always derived —
         * never supplied — by `deriveBaseLanguage`. Worth a column, not a `split('-')` per call
         * site, because it is what an "everything Portuguese" query groups on.
         */
        baseLanguage: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        nativeName: {
            type: String,
            required: true,
            trim: true
        },
        direction: {
            type: String,
            enum: Object.values(LocaleDirection),
            default: LocaleDirection.ltr
        },
        /*
         * Inactive means invisible to every PUBLIC route — absent from the manifest, 404 on the
         * dictionary. One flag, and deliberately not two: "hidden" and "draft" are the same state
         * here, and if a language ever needs to be published-but-hidden that is a second field
         * rather than a reinterpretation of this one.
         */
        active: {
            type: Boolean,
            default: true
        },
        /*
         * Bumped on any write to this language's entries; a client re-fetches only when the
         * manifest reports a higher revision than the one it holds. The bump lives in the
         * repository (see `./repository`), so no service path can change an entry without moving
         * it.
         */
        revision: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    {
        timestamps: true
    }
);

/*
 * Derived on every save so the column cannot drift from `tag` — a hook rather than an assignment
 * in `createLanguage`, since every write path (including tests and migrations) must derive it.
 * `pre('validate')`, not `pre('save')`, because `required: true` is checked at validation time.
 */
localeSchema.pre('validate', function derivesBaseLanguage() {
    if (this.tag) this.baseLanguage = deriveBaseLanguage(this.tag);
});

/*
 * Named explicitly, not derived: `db/migrations/20260905000000-baseline.js` creates this same
 * index under this same name, and a derived name would conflict at boot on migrated databases
 * (see `users/model.ts`).
 *
 * UNIQUE on tag: a language is created by check-then-insert, so only the database can refuse two
 * concurrent creations of `es`.
 */
localeSchema.index({ tag: 1 }, { name: 'locales_tag', unique: true });

/** The words. One row per (language, tenant, key). */
export const localeEntrySchema = new Schema<LocaleEntryDocument, LocaleEntryModel>(
    {
        /*
         * The language's `tag`, stored as a string rather than an ObjectId reference — the read
         * this collection exists for ("every row for `es`") needs no join. Referential integrity
         * is enforced elsewhere: deleting a language cascades its entries in one repository call.
         */
        locale: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        /*
         * Whose dictionary this row overrides — a tenant id, see `./tenants`. Part of the row's
         * IDENTITY (see the unique index below), not a label: two tenants may both declare a
         * top-level `generic`, so a key alone cannot tell them apart.
         *
         * A plain string, not an enum: which tenants exist is configuration (`./tenants`), and the
         * service refuses an unknown one with 422 before a row is written.
         */
        tenant: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        /*
         * Flat and dotted (`products.list.title`), stored AS A STRING. The alternative — one
         * document per language with a nested `messages` object — turns `$set` on one key into
         * three levels of Mongo nesting, a trap that bites once and keeps biting.
         */
        key: {
            type: String,
            required: true,
            trim: true
        },
        /*
         * `default: ''` rather than `required: true`: an empty translation is a legitimate row —
         * a key added by an import and not yet translated — and `required` on a String rejects the
         * empty string. The contract still requires the field on the wire, which the default
         * guarantees.
         */
        value: {
            type: String,
            default: ''
        }
    },
    {
        timestamps: true
    }
);

/*
 * UNIQUE, so a duplicate key is a database guarantee, not a service-layer hope: two concurrent
 * imports of the same key would otherwise both read "absent".
 *
 * `tenant` sits in the middle, not the end: a compound index serves any PREFIX of its keys, so
 * this one answers both `find({ locale, tenant })` (the per-download read) and `find({ locale })`
 * (the admin listing) without a scan. No separate `locale`-only index for that reason.
 */
localeEntrySchema.index(
    { locale: 1, tenant: 1, key: 1 },
    { name: 'localeEntries_locale_tenant_key', unique: true }
);

/** Normalizes a serialized language: `_id` → `id`, drops `__v`. */
export const applyLocaleTransform = applySerialization(localeSchema);

/** Normalizes a serialized entry, for the lean results `search()` returns. */
export const applyLocaleEntryTransform = applySerialization(localeEntrySchema);

/** Language model entrypoint. */
export const localeModel = model<LocaleDocument, LocaleModel>('Locale', localeSchema);

/**
 * Entry model entrypoint. One row per (language, tenant, key) — the stored dictionary, as opposed
 * to `LocaleMessages`, which is the flat map assembled from these rows and served to a client.
 *
 * Mongoose derives the collection name by lowercasing and pluralising, so this is `localeentries`
 * on disk — the same derivation that gives `audit-logs` its `auditlogs`.
 */
export const localeEntryModel = model<LocaleEntryDocument, LocaleEntryModel>(
    'LocaleEntry',
    localeEntrySchema
);

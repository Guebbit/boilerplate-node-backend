import { model, Schema } from 'mongoose';
import type { Document, Model, QueryFilter } from 'mongoose';
import { LocaleDirection } from '@types';
import type { Language, LocaleEntry } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * The two collections behind the DYNAMIC locale tier — the client's copy, edited at runtime.
 *
 * Neither is read by `t()`, by `negotiateLocale`, or by anything else on the request path. That is
 * the whole design: `@infrastructure/i18n` loads the API's own copy from deployed files at boot and
 * never revisits it, so Mongo being down, a language half-translated or a malformed key can cost at
 * most the two endpoints that read these rows. See `openapi.yaml` for the tier split in full.
 */

/** Mongoose document type for a registered language. Overrides the generated `Language`'s dates. */
export interface LocaleDocument extends Omit<Language, 'id' | 'createdAt' | 'updatedAt'>, Document {
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose document type for one translated string. */
export interface LocaleMessageDocument
    extends Omit<LocaleEntry, 'id' | 'createdAt' | 'updatedAt'>, Document {
    createdAt?: Date;
    updatedAt?: Date;
}

export type LocaleModel = Model<LocaleDocument>;
export type LocaleMessageModel = Model<LocaleMessageDocument>;
/** Shorthand types for Mongoose query filters on the two collections. */
export type LocaleQueryFilter = QueryFilter<LocaleDocument>;
export type LocaleMessageQueryFilter = QueryFilter<LocaleMessageDocument>;

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
         * Bumped on any write to this language's entries. A client stores the revision it
         * downloaded and re-fetches only when the manifest reports a higher one.
         *
         * The bump lives in the repository, in the same call as the write that earns it (see
         * `./repository`), so no service path can change an entry without moving the number.
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
 * Names given rather than derived, for the reason `users/model.ts` states at length: Mongo
 * identifies an index by name as well as by key, and `db/migrations/20260817140000-locale-
 * collections.js` creates these same two under these same names. A derived name on one side would
 * be an index-options conflict at boot on every migrated database, and nowhere else.
 *
 * UNIQUE on the tag: a language is created by a check-then-insert, so only the database can refuse
 * the second of two concurrent creations of `es`.
 */
localeSchema.index({ tag: 1 }, { name: 'locales_tag', unique: true });

/** The words. One row per (language, key). */
export const localeMessageSchema = new Schema<LocaleMessageDocument, LocaleMessageModel>(
    {
        /*
         * The language's `tag`, stored as the string rather than as an ObjectId reference.
         *
         * The read this collection exists for is "give me every row for `es`", and a string match
         * on an indexed field answers it with no join and no populate. What a reference would have
         * bought — referential integrity — is enforced where it actually matters instead: deleting
         * a language cascades its entries in one repository call, and refuses while the language is
         * still active.
         */
        locale: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        /*
         * Flat and dotted (`products.list.title`), and stored AS A STRING.
         *
         * The alternative — one document per language holding a nested `messages` object — turns
         * editing one word into `$set: { "messages.products.list.title": v }`, which Mongo reads as
         * three levels of nesting rather than as one key. Escaping the dots to avoid that is a trap
         * that bites once and then keeps biting.
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
 * UNIQUE, which is what makes a duplicate key a database guarantee rather than a service-layer
 * hope: every write path here is a check-then-insert, and two concurrent imports of the same key
 * would otherwise both read "absent".
 *
 * There is deliberately no separate `{ locale: 1 }` index for the whole-dictionary read. A
 * compound index serves queries on any PREFIX of its keys, so this one already answers
 * `find({ locale })` — a second index on the same prefix would be write cost buying nothing, which
 * is exactly what `db/migrations/20260808180000-prune-unused-indexes.js` exists to have removed.
 */
localeMessageSchema.index(
    { locale: 1, key: 1 },
    { name: 'localeMessages_locale_key', unique: true }
);

/** Normalizes a serialized language: `_id` → `id`, drops `__v`. */
export const applyLocaleTransform = applySerialization(localeSchema);

/** Normalizes a serialized entry, for the lean results `search()` returns. */
export const applyLocaleMessageTransform = applySerialization(localeMessageSchema);

/** Language model entrypoint. */
export const localeModel = model<LocaleDocument, LocaleModel>('Locale', localeSchema);

/**
 * Entry model entrypoint.
 *
 * Mongoose derives the collection name by lowercasing and pluralising, so this is `localemessages`
 * on disk — the same derivation that gives `audit-logs` its `auditlogs`. The migration and the
 * exported dataset name it accordingly.
 */
export const localeMessageModel = model<LocaleMessageDocument, LocaleMessageModel>(
    'LocaleMessage',
    localeMessageSchema
);

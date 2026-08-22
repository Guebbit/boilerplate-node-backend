import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { LocaleDirection } from '@types';
import type { Language, LocaleEntry } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * The two collections behind the OVERRIDE tier — both dictionaries' runtime edits.
 *
 * Nothing here is AWAITED on the request path, which is the property to preserve when changing any
 * of it. `negotiateLocale` never reads a row, and `t()` never waits for one: the backend tenant's rows
 * reach it through an overlay that `@infrastructure/i18n` rebuilds at boot, on a timer and after a
 * write, and that overlay is layered onto dictionaries already loaded from deployed files. Mongo
 * down, a language half-translated, a malformed key — the worst outcome is the two endpoints that
 * read these rows failing and the overlay going stale, never a request that cannot resolve its own
 * copy. See `openapi.yaml` for the tier split in full.
 */

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
export interface LocaleMessageDocument
    extends Omit<LocaleEntry, 'id' | 'createdAt' | 'updatedAt'>, Document {
    createdAt?: Date;
    updatedAt?: Date;
}

export type LocaleModel = Model<LocaleDocument>;
export type LocaleMessageModel = Model<LocaleMessageDocument>;

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
         * The ISO 639-1 code at the front of `tag`, kept as its own column.
         *
         * Derived, never supplied: `deriveBaseLanguage` is the one place that computes it, and
         * every write path goes through it. A client that could send this could send a `pt-BR`
         * whose base says `es`.
         *
         * Worth a column rather than a `split('-')` at each call site because it is the field
         * that groups a language's variants — "everything Portuguese" is a query on this, and a
         * query cannot be written against a string operation.
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
 * Derived on every save, so the column cannot drift from the tag it comes from.
 *
 * A hook rather than an assignment in `createLanguage`, because "derived" has to hold for every
 * write path and there is more than one: the service creates, tests and migrations write
 * documents directly, and a future caller will not know it owes this field a value. Setting it
 * here means the only way to get it wrong is to change `tag` and `baseLanguage` in the same
 * breath, which nothing can do — the field is not in any request schema.
 *
 * `pre('validate')` and not `pre('save')`: `required: true` is checked during validation, so a
 * `save` hook would run after the error it exists to prevent.
 */
localeSchema.pre('validate', function derivesBaseLanguage() {
    if (this.tag) this.baseLanguage = deriveBaseLanguage(this.tag);
});

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

/** The words. One row per (language, tenant, key). */
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
         * Whose dictionary this row overrides — a tenant id, see `./tenants`.
         *
         * Part of the row's IDENTITY, not a label on it — see the unique index below. Two tenants
         * are independently authored and may both declare a top-level `generic`, so
         * `generic.error-internal` is one string in the API's copy and a different one in a
         * client's. A key alone cannot tell them apart.
         *
         * A plain string rather than an enum: which tenants exist is configuration (`./tenants`),
         * and the service refuses an unknown one with a 422 before a row is written. The schema
         * stays ignorant on purpose — an enum here would have to be rebuilt from the environment
         * at model load, which is exactly the kind of boot-order trap `./tenants` avoids.
         * `db/migrations/20260822120000-locale-entry-tenant.js` renames the old `scope` column.
         */
        tenant: {
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
 * `tenant` sits in the middle rather than at the end, and that ordering is the read this collection
 * exists for. A compound index serves queries on any PREFIX of its keys, so this one answers both
 * `find({ locale, tenant })` — the whole-dictionary read, once per download — and `find({ locale })`
 * for the admin listing that shows every tenant at once. Ending on `tenant` would answer neither
 * without a scan.
 *
 * There is deliberately no second index on `locale` alone for that reason, which is exactly what
 * `db/migrations/20260808180000-prune-unused-indexes.js` exists to have removed.
 */
localeMessageSchema.index(
    { locale: 1, tenant: 1, key: 1 },
    { name: 'localeMessages_locale_tenant_key', unique: true }
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

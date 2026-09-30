/**
 * @module
 * Every spelling of a new module's name the templates need, derived once from the folder name so
 * no template re-derives (and mis-derives) its own casing.
 */

/** The spellings of one module, derived by {@link deriveNames}. */
export interface ModuleNames {
    /** Folder and URL segment: `field-notes`. */
    kebab: string;
    /** The default-import identifier in `src/modules.ts`: `fieldNotes`. */
    identifier: string;
    /** Permission-key family — hyphens removed, since a key is `[a-z.]` only: `fieldnotes`. */
    family: string;
    /** One record's type name: `FieldNote`. */
    entity: string;
    /** One record's variable name: `fieldNote`. */
    entityCamel: string;
    /** The audit-action noun, snake-cased: `field_note`. */
    entitySnake: string;
    /** The collection's type-name stem: `FieldNotes`. */
    plural: string;
    /** The collection's variable name: `fieldNotes`. */
    pluralCamel: string;
    /** Where the router mounts: `/field-notes`. */
    basePath: string;
    /** Lower-case words for prose: `field notes`. */
    words: string;
}

/** A folder name a module may carry: lower-case letters only, hyphen-separated, so a key is legal. */
const MODULE_NAME = /^[a-z]+(-[a-z]+)*$/;

/** A PascalCase entity name. */
const ENTITY_NAME = /^[A-Z][A-Za-z]*$/;

/**
 * Whether `name` may name a module. Digits are refused on purpose: the permission-key grammar is
 * `[a-z.]` only, and the family is the folder name minus its hyphens.
 * @param name - the candidate folder name
 * @returns true when the name is usable
 */
export const isValidModuleName = (name: string): boolean => MODULE_NAME.test(name);

/**
 * Whether `entity` may name a record type.
 * @param entity - the candidate PascalCase type name
 * @returns true when the name is usable
 */
export const isValidEntityName = (entity: string): boolean => ENTITY_NAME.test(entity);

/**
 * `field-notes` to `FieldNotes`.
 * @param kebab - a hyphenated lower-case name
 * @returns the PascalCase spelling
 */
const pascal = (kebab: string): string =>
    kebab
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');

/**
 * `FieldNote` to `fieldNote`.
 * @param value - a PascalCase name
 * @returns the camelCase spelling
 */
const lowerFirst = (value: string): string => value.charAt(0).toLowerCase() + value.slice(1);

/**
 * `FieldNote` to `field_note`.
 * @param value - a PascalCase name
 * @returns the snake_case spelling
 */
const snake = (value: string): string =>
    lowerFirst(value).replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/**
 * The naive singular of the last word: `-ies` to `-y`, a trailing `s` dropped unless it is `ss`.
 * Wrong for irregular nouns, which is what `--entity` is for.
 * @param word - the PascalCase plural
 * @returns the PascalCase singular
 */
const singular = (word: string): string => {
    if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.endsWith('ss')) return word;
    return word.endsWith('s') ? word.slice(0, -1) : word;
};

/**
 * The plural stem for type names: the folder's own PascalCase when it already differs from the
 * entity (`FieldNotes`), else the entity with an `s` (`Catalog` to `Catalogs`) so the two never
 * collide.
 * @param folder - the PascalCase folder name
 * @param entity - the PascalCase entity name
 * @returns the plural stem
 */
const pluralOf = (folder: string, entity: string): string =>
    folder === entity ? `${entity}s` : folder;

/**
 * Derive every spelling of a module's name.
 * @param kebab - the validated folder name
 * @param entityOverride - an explicit entity name, for a noun the naive singular gets wrong
 * @returns all the spellings the templates read
 */
export const deriveNames = (kebab: string, entityOverride?: string): ModuleNames => {
    const folder = pascal(kebab);
    const entity = entityOverride ?? singular(folder);
    const plural = pluralOf(folder, entity);

    return {
        kebab,
        identifier: lowerFirst(folder),
        family: kebab.replaceAll('-', ''),
        entity,
        entityCamel: lowerFirst(entity),
        entitySnake: snake(entity),
        plural,
        pluralCamel: lowerFirst(plural),
        basePath: `/${kebab}`,
        words: kebab.replaceAll('-', ' ')
    };
};

/** The actions a scaffolded module's permission keys cover, in declaration order. */
export const KEY_ACTIONS = ['read', 'create', 'update', 'delete'] as const;

/**
 * The permission keys a scaffolded module introduces.
 * @param names - the module's spellings
 * @returns one key per action, e.g. `fieldnotes.any.read`
 */
export const permissionKeys = (names: ModuleNames): string[] =>
    KEY_ACTIONS.map((action) => `${names.family}.any.${action}`);

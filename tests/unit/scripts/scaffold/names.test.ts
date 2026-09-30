/**
 * @module
 * The spellings a module name derives, and which names are refused. Every template reads these, so
 * a wrong casing here is a wrong identifier in every generated file.
 */

import {
    deriveNames,
    isValidEntityName,
    isValidModuleName,
    permissionKeys
} from '../../../../scripts/scaffold/names';

describe('isValidModuleName', () => {
    it.each(['notes', 'field-notes', 'api-keys'])('accepts %s', (name) => {
        expect(isValidModuleName(name)).toBe(true);
    });

    // Digits are refused because the permission-key grammar is letters and dots only.
    it.each(['Notes', 'field_notes', 'notes2', '-notes', 'notes-', 'a--b', ''])(
        'refuses "%s"',
        (name) => {
            expect(isValidModuleName(name)).toBe(false);
        }
    );
});

describe('isValidEntityName', () => {
    it('wants PascalCase letters only', () => {
        expect(isValidEntityName('FieldNote')).toBe(true);
        expect(isValidEntityName('fieldNote')).toBe(false);
        expect(isValidEntityName('Field-Note')).toBe(false);
    });
});

describe('deriveNames', () => {
    it('derives every spelling from a hyphenated plural', () => {
        expect(deriveNames('field-notes')).toEqual({
            kebab: 'field-notes',
            identifier: 'fieldNotes',
            family: 'fieldnotes',
            entity: 'FieldNote',
            entityCamel: 'fieldNote',
            entitySnake: 'field_note',
            plural: 'FieldNotes',
            pluralCamel: 'fieldNotes',
            basePath: '/field-notes',
            words: 'field notes'
        });
    });

    it.each([
        ['categories', 'Category'],
        ['glass', 'Glass'],
        ['boxes', 'Boxe']
    ])('singularises %s naively to %s', (name, entity) => {
        expect(deriveNames(name).entity).toBe(entity);
    });

    it('lets --entity fix a noun the naive singular gets wrong', () => {
        expect(deriveNames('boxes', 'Box').entity).toBe('Box');
    });

    // A singular folder name would otherwise give the record and its collection one type name.
    it('never gives the record and its collection the same type name', () => {
        const names = deriveNames('catalog');

        expect(names.entity).toBe('Catalog');
        expect(names.plural).toBe('Catalogs');
    });
});

describe('permissionKeys', () => {
    it('spells a key with no hyphen, one per action', () => {
        expect(permissionKeys(deriveNames('field-notes'))).toEqual([
            'fieldnotes.any.read',
            'fieldnotes.any.create',
            'fieldnotes.any.update',
            'fieldnotes.any.delete'
        ]);
    });
});

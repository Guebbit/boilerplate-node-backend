import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    readRemovedFields,
    stripValidationLabels
} from '../../../../scripts/scaffold/demo-remove-validation-labels';

/** A throwaway repo root with a surviving and a removed module's contracts, and two dictionaries. */
let root: string;

/**
 * Write a file under the throwaway root, creating its folder.
 * @param relative - path from the root
 * @param content - the file's text
 */
const write = (relative: string, content: string): void => {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
};

/**
 * The labels one dictionary is left with.
 * @param locale - the dictionary's file name, without `.json`
 */
const labelsOf = (locale: string): string[] =>
    Object.keys(
        (
            JSON.parse(
                readFileSync(path.join(root, 'src', 'locales', `${locale}.json`), 'utf8')
            ) as {
                validation: { attributes: Record<string, string> };
            }
        ).validation.attributes
    );

/**
 * A dictionary labelling every field the fixtures name.
 * @param word - what each label says, so the two languages differ
 */
const dictionary = (word: string): string =>
    `${JSON.stringify(
        {
            generic: { ok: word },
            validation: {
                attributes: Object.fromEntries(
                    ['email', 'city', 'page', 'quantity', 'imageUpload', 'total'].map((field) => [
                        field,
                        `${word} ${field}`
                    ])
                )
            }
        },
        null,
        4
    )}\n`;

/**
 * The surviving module's contract: a JSON body reaching `city` through a `$ref`, a query
 * parameter, a multipart body and a response.
 */
const SURVIVOR = `paths:
    /account:
        get:
            parameters:
                - { name: page, in: query }
            responses:
                '200':
                    content:
                        application/json:
                            schema: { type: object, properties: { total: { type: integer } } }
        patch:
            requestBody:
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                email: { type: string }
                                address: { $ref: '#/components/schemas/Address' }
        put:
            requestBody:
                content:
                    multipart/form-data:
                        schema: { type: object, properties: { imageUpload: { type: string } } }
components:
    schemas:
        Address:
            type: object
            properties:
                city: { type: string }
`;

/** The removed module's contract: every field above, plus one only it names. */
const REMOVED = `paths:
    /cart:
        post:
            requestBody:
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                email: { type: string }
                                city: { type: string }
                                page: { type: integer }
                                quantity: { type: integer }
                                imageUpload: { type: string }
                                total: { type: integer }
`;

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'demo-remove-validation-labels-'));
    write('src/modules/account/openapi.yaml', SURVIVOR);
    write('src/modules/cart/openapi.yaml', REMOVED);
    mkdirSync(path.join(root, 'shared', 'contracts'), { recursive: true });
    write('src/locales/en.json', dictionary('The'));
    write('src/locales/it.json', dictionary('Il'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('readRemovedFields', () => {
    it('keeps what a surviving JSON body or query still carries, drops what only responses or multipart name', () => {
        expect([...readRemovedFields(root, ['cart'])].toSorted()).toEqual([
            'imageUpload',
            'quantity',
            'total'
        ]);
    });
});

describe('stripValidationLabels', () => {
    it('drops the labels from every dictionary and leaves the rest of each file as it was', () => {
        const notes = stripValidationLabels(root, new Set(['quantity', 'total']));

        expect(labelsOf('en')).toEqual(['email', 'city', 'page', 'imageUpload']);
        expect(labelsOf('it')).toEqual(['email', 'city', 'page', 'imageUpload']);
        expect(readFileSync(path.join(root, 'src', 'locales', 'it.json'), 'utf8')).toContain(
            '"ok": "Il"'
        );
        expect(notes.map((note) => note.file).toSorted()).toEqual([
            path.join('src', 'locales', 'en.json'),
            path.join('src', 'locales', 'it.json')
        ]);
    });

    it('writes nothing when no label names a removed field', () => {
        expect(stripValidationLabels(root, new Set(['nowhere']))).toEqual([]);
        expect(readFileSync(path.join(root, 'src', 'locales', 'en.json'), 'utf8')).toBe(
            dictionary('The')
        );
    });
});

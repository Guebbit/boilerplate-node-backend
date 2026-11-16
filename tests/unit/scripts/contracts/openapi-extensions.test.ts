/**
 * `openapi-extensions` — a module extending another module's enums and unions by a fragment of its
 * own. Driven with scratch module trees and a minimal bundle: the property under test is the merge
 * rule and its refusals, not the modules that use it today.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { asStub } from '@tests/stub';
import { parse as parseYaml } from 'yaml';

import {
    checkExtensions,
    enumSourcesOf,
    extensionFragments,
    withExtensionSchemas,
    withUnionExtensions
} from '../../../../scripts/contracts/openapi-extensions';
import type { OpenApiDocument } from '../../../../scripts/contracts/openapi-document';

/** Temp roots the cases created, removed after each case. */
const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A scratch `src/modules` holding the given `<module>/<file>` texts. */
const modulesWith = (files: Record<string, string>): string => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'extensions-'));
    roots.push(root);
    for (const [relative, text] of Object.entries({ 'owner/openapi.yaml': OWNER, ...files })) {
        mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
        writeFileSync(path.join(root, relative), text);
    }
    return root;
};

/** A one-variant notice schema carrying its discriminator value. */
const VARIANT = `
        ShopNotice:
            type: object
            properties:
                code: { type: string, enum: [shop.notice] }
                severity: { $ref: '../owner/openapi.yaml#/components/schemas/Severity' }
`;

/** The owner's own contract: the schemas an extension may name. */
const OWNER = `openapi: 3.1.0
components:
    schemas:
        Kind: { type: string, enum: [contact], x-enum-from: Kind }
        Notice: { oneOf: [] }
`;

/** The fragment a shop-like module ships for `owner`. */
const FRAGMENT = `x-extends:
    Kind: [refund, dispute]
    Notice: [ShopNotice]
components:
    schemas:${VARIANT}`;

/** A bundle with an open enum and a discriminated union, as the owner publishes them. */
const bundle = () =>
    asStub<OpenApiDocument>({
        openapi: '3.1.0',
        components: {
            schemas: {
                Kind: { type: 'string', enum: ['contact'], 'x-enum-from': 'Kind' },
                Severity: { type: 'string', enum: ['info'] },
                Notice: {
                    oneOf: [{ $ref: '#/components/schemas/Own' }],
                    discriminator: {
                        propertyName: 'code',
                        mapping: { 'own.notice': '#/components/schemas/Own' }
                    }
                },
                Own: { type: 'object', properties: { code: { enum: ['own.notice'] } } },
                ShopNotice: {
                    type: 'object',
                    properties: { code: { type: 'string', enum: ['shop.notice'] } }
                }
            }
        }
    });

/** The extensions found in a scratch tree holding one `openapi.owner.yaml`. */
const fragmentsOf = (text: string) =>
    extensionFragments(modulesWith({ 'shop/openapi.owner.yaml': text }));

/** Applies the union step to a bundle, returning its schemas. */
const run = (text: string, document = bundle()) => {
    withUnionExtensions(fragmentsOf(text))(document);
    return document.components?.schemas;
};

describe('extensionFragments', () => {
    it('finds openapi.<owner>.yaml files that carry x-extends, and skips every other openapi.* file', () => {
        const root = modulesWith({
            'shop/openapi.owner.yaml': FRAGMENT,
            'shop/openapi.browser-events.yaml': 'components:\n    schemas: {}\n',
            'shop/openapi.yaml': 'paths: {}\n'
        });

        const found = extensionFragments(root);

        expect(found.map(({ module, owner }) => [module, owner])).toEqual([['shop', 'owner']]);
        expect(Object.keys(found[0].schemas)).toEqual(['ShopNotice']);
    });

    it.each([
        ['an empty file', ''],
        ['a comment-only file', '# nothing here yet\n']
    ])(
        'refuses %s: a fragment that adds nothing is a mistake, not a skipped file',
        (_name, text) => {
            const root = modulesWith({ 'shop/openapi.owner.yaml': text });

            expect(() => extensionFragments(root)).toThrow(
                /openapi\.owner\.yaml: fragment is empty/
            );
        }
    );

    it('refuses an x-extends that is not a map of string lists', () => {
        const root = modulesWith({ 'shop/openapi.owner.yaml': 'x-extends:\n    Kind: nope\n' });

        expect(() => extensionFragments(root)).toThrow(/x-extends Kind must be a list of strings/);
    });

    it('refuses a fragment whose owner module ships no contract', () => {
        const root = modulesWith({ 'shop/openapi.ghost.yaml': 'x-extends:\n    Kind: [refund]\n' });

        expect(() => extensionFragments(root)).toThrow(/owner module ghost ships no openapi.yaml/);
    });

    it('refuses an x-extends naming a schema the owner does not declare', () => {
        const root = modulesWith({ 'shop/openapi.owner.yaml': 'x-extends:\n    Nope: [x]\n' });

        expect(() => extensionFragments(root)).toThrow(/x-extends Nope is not a schema of owner/);
    });
});

describe('enumSourcesOf', () => {
    it('joins what several fragments append to the same schema, in fragment order', () => {
        const root = modulesWith({
            'a/openapi.owner.yaml': 'x-extends:\n    Kind: [one]\n',
            'b/openapi.owner.yaml': 'x-extends:\n    Kind: [two]\n'
        });

        expect(enumSourcesOf(extensionFragments(root))).toEqual({ Kind: ['one', 'two'] });
    });
});

describe('checkExtensions', () => {
    it('accepts an enum that declares x-enum-from and a oneOf', () => {
        expect(() => {
            checkExtensions(fragmentsOf(FRAGMENT))(bundle());
        }).not.toThrow();
    });

    it('refuses a target the owner did not open', () => {
        const document = bundle();
        delete document.components?.schemas?.Kind;

        expect(() => {
            checkExtensions(fragmentsOf(FRAGMENT))(document);
        }).toThrow(/x-extends Kind names no schema/);

        const closed = bundle();
        asStub<{ components: { schemas: Record<string, unknown> } }>(
            closed
        ).components.schemas.Kind = { type: 'string', enum: ['x'] };
        expect(() => {
            checkExtensions(fragmentsOf(FRAGMENT))(closed);
        }).toThrow(/neither a oneOf nor declares x-enum-from/);
    });
});

describe('withExtensionSchemas', () => {
    const ROOT = 'openapi: 3.1.0\ncomponents:\n    schemas:\n        Id: { type: string }\n';

    it('adds each fragment schema to the root as a ref to its staged file', () => {
        const root = modulesWith({ 'shop/openapi.owner.yaml': FRAGMENT });

        const staged = parseYaml(withExtensionSchemas(ROOT, extensionFragments(root), root)) as {
            components: { schemas: Record<string, unknown> };
        };

        expect(staged.components.schemas.ShopNotice).toEqual({
            $ref: '../../src/modules/shop/openapi.owner.yaml#/components/schemas/ShopNotice'
        });
        expect(staged.components.schemas.Id).toEqual({ type: 'string' });
    });

    it('returns the root untouched when nothing extends anything', () => {
        expect(withExtensionSchemas(ROOT, [])).toBe(ROOT);
    });

    it('refuses a schema name the root already declares', () => {
        const root = modulesWith({ 'shop/openapi.owner.yaml': FRAGMENT });
        const taken = ROOT.replace('Id:', 'ShopNotice:');

        expect(() => withExtensionSchemas(taken, extensionFragments(root), root)).toThrow(
            /schema ShopNotice already exists in the root/
        );
    });
});

describe('withUnionExtensions', () => {
    it('appends the variants and maps each under its discriminator value', () => {
        const schemas = run(FRAGMENT);

        expect(schemas?.Notice).toMatchObject({
            oneOf: [
                { $ref: '#/components/schemas/Own' },
                { $ref: '#/components/schemas/ShopNotice' }
            ],
            discriminator: {
                mapping: {
                    'own.notice': '#/components/schemas/Own',
                    'shop.notice': '#/components/schemas/ShopNotice'
                }
            }
        });
    });

    it('reads the discriminator value off the union’s own propertyName', () => {
        const document = bundle();
        const notice = document.components?.schemas?.Notice as {
            discriminator: { propertyName: string; mapping: Record<string, string> };
        };
        notice.discriminator.propertyName = 'kind';
        const shop = document.components?.schemas?.ShopNotice as { properties: object };
        shop.properties = { kind: { type: 'string', enum: ['shop.kind'] } };

        run(FRAGMENT, document);

        expect(notice.discriminator.mapping['shop.kind']).toBe('#/components/schemas/ShopNotice');
    });

    it('moves the fragment’s schemas behind everything else, in fragment order', () => {
        const schemas = run(FRAGMENT);

        expect(Object.keys(schemas ?? {}).at(-1)).toBe('ShopNotice');
    });

    it('leaves enum keys to the enum fill', () => {
        expect(run(FRAGMENT)?.Kind).toEqual({
            type: 'string',
            enum: ['contact'],
            'x-enum-from': 'Kind'
        });
    });

    it('refuses a variant the fragment does not declare', () => {
        expect(() => run('x-extends:\n    Notice: [Ghost]\n')).toThrow(
            /variant Ghost is not declared/
        );
    });

    it('refuses a variant with no discriminator value to read', () => {
        const document = bundle();
        const shop = document.components?.schemas?.ShopNotice as { properties: object };
        shop.properties = { code: { type: 'string' } };

        expect(() => run(FRAGMENT, document)).toThrow(/has no properties.code.enum/);
    });

    it('leaves a oneOf-less target alone (an enum key is the enum fill’s business)', () => {
        expect(() => run('x-extends:\n    Kind: [refund]\n')).not.toThrow();
    });

    it('refuses a discriminator value two variants share', () => {
        const document = bundle();
        const shop = document.components?.schemas?.ShopNotice as { properties: object };
        shop.properties = { code: { type: 'string', enum: ['own.notice'] } };

        expect(() => run(FRAGMENT, document)).toThrow(/reuses the discriminator value own.notice/);
    });
});

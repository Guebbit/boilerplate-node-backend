/**
 * `openapi-extensions` — a module extending another module's enums and unions by a fragment of its
 * own. Driven with scratch module trees and a minimal bundle: the property under test is the merge
 * rule and its refusals, not the modules that use it today.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { asStub } from '@tests/stub';

import {
    checkExtensions,
    enumSourcesOf,
    extensionFragments,
    withUnionExtensions
} from '../../../../scripts/contracts/openapi-extensions';
import type { OpenApiDocument } from '../../../../scripts/contracts/openapi-document';

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A scratch `src/modules` holding the given `<module>/<file>` texts. */
const modulesWith = (files: Record<string, string>): string => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'extensions-'));
    roots.push(root);
    for (const [relative, text] of Object.entries(files)) {
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
                Own: { type: 'object', properties: { code: { enum: ['own.notice'] } } }
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

    it('refuses an x-extends that is not a map of string lists', () => {
        const root = modulesWith({ 'shop/openapi.owner.yaml': 'x-extends:\n    Kind: nope\n' });

        expect(() => extensionFragments(root)).toThrow(/must map a schema name to a list/);
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

describe('withUnionExtensions', () => {
    it('adds the schemas, appends the variants and maps each under its code', () => {
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
        expect(schemas?.ShopNotice).toBeDefined();
    });

    it('makes refs into the owner’s file local', () => {
        const shopNotice = run(FRAGMENT)?.ShopNotice as { properties: { severity: unknown } };

        expect(shopNotice.properties.severity).toEqual({ $ref: '#/components/schemas/Severity' });
    });

    it('leaves enum keys to the enum fill', () => {
        expect(run(FRAGMENT)?.Kind).toEqual({
            type: 'string',
            enum: ['contact'],
            'x-enum-from': 'Kind'
        });
    });

    it('refuses a schema name the bundle already holds', () => {
        const text = FRAGMENT.replaceAll('ShopNotice', 'Own');

        expect(() => run(text)).toThrow(/schema Own already exists/);
    });

    it('refuses a variant the fragment does not declare', () => {
        expect(() => run('x-extends:\n    Notice: [Ghost]\n')).toThrow(/Ghost is not declared/);
    });

    it('refuses a variant with no code enum to read its discriminator from', () => {
        const text = FRAGMENT.replace(
            'code: { type: string, enum: [shop.notice] }',
            'code: { type: string }'
        );

        expect(() => run(text)).toThrow(/has no properties.code.enum/);
    });

    it('leaves a oneOf-less target alone (an enum key is the enum fill’s business)', () => {
        expect(() => run('x-extends:\n    Kind: [refund]\n')).not.toThrow();
    });

    it('refuses a discriminator value two variants share', () => {
        const text = FRAGMENT.replace('shop.notice', 'own.notice');

        expect(() => run(text)).toThrow(/reuses the discriminator value own.notice/);
    });
});

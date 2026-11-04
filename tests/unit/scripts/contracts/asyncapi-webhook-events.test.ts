import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from 'yaml';
import {
    localiseOpenApiReferences,
    sectionFragments,
    webhookEventFragments,
    webhookEventNames,
    withSectionFragments
} from '../../../../scripts/contracts/asyncapi-webhook-events';

/** A section document with nothing in it, standing in for any section's parsed file. */
const emptySection = () => parseDocument('asyncapi: 3.0.0\n');

describe('webhookEventFragments', () => {
    it('finds every module that ships a fragment, the shop modules first', () => {
        const owners = webhookEventFragments().map((file) => file.split('/').at(-2));

        expect(owners).toEqual(['orders', 'delivery', 'payments', 'returns', 'example', 'users']);
    });
});

describe('webhookEventNames', () => {
    it('lists the channels of every fragment once, in fragment order', () => {
        const names = webhookEventNames();

        expect(names.slice(0, 3)).toEqual(['order.created', 'order.paid', 'order.cancelled']);
        expect(new Set(names).size).toBe(names.length);
        expect(names).toContain('payment.refunded');
    });
});

describe('withSectionFragments', () => {
    it('merges one fragment per owner into the webhooks section', () => {
        const merge = jest.fn();
        const document = emptySection();

        const result = withSectionFragments('webhooks', document, merge);

        expect(result).toBe(document);
        expect(merge.mock.calls.map((call) => call[1])).toEqual([
            'orders',
            'delivery',
            'payments',
            'returns',
            'example',
            'users'
        ]);
    });

    it('leaves every other section alone', () => {
        const merge = jest.fn();

        withSectionFragments('observability', emptySection(), merge);

        expect(merge).not.toHaveBeenCalled();
    });
});

/** The owner's section, with a union the fragment may extend. */
const section = () =>
    parseDocument(
        'components:\n    schemas:\n        Payload:\n            oneOf:\n                - $ref: "#/components/schemas/Own"\n'
    );

describe('sections other than webhooks', () => {
    const roots: string[] = [];

    afterEach(() => {
        for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    });

    /** A scratch modules root with a notifications fragment in module `shop`. */
    const modulesRoot = (fragment: string): string => {
        const root = mkdtempSync(path.join(os.tmpdir(), 'section-fragments-'));
        roots.push(root);
        mkdirSync(path.join(root, 'shop'));
        writeFileSync(path.join(root, 'shop', 'asyncapi.notifications.yaml'), fragment);
        return root;
    };

    const FRAGMENT =
        'x-extends:\n    Payload: [ShopPayload]\ncomponents:\n    schemas:\n        ShopPayload:\n            type: object\n';

    it('finds fragments named for the section, and none for a section nobody extends', () => {
        const root = modulesRoot(FRAGMENT);

        expect(sectionFragments('notifications', root)).toEqual([
            path.join(root, 'shop', 'asyncapi.notifications.yaml')
        ]);
        expect(sectionFragments('webhooks', root)).toEqual([]);
    });

    it('merges the fragment and appends its x-extends names to the union’s oneOf', () => {
        const merge = jest.fn();
        const document = section();

        withSectionFragments('notifications', document, merge, modulesRoot(FRAGMENT));

        expect(merge.mock.calls.map((call) => call[1])).toEqual(['shop']);
        expect(document.toJS().components.schemas.Payload.oneOf).toEqual([
            { $ref: '#/components/schemas/Own' },
            { $ref: '#/components/schemas/ShopPayload' }
        ]);
    });

    it('refuses an x-extends naming a schema that is no oneOf of the section', () => {
        const root = modulesRoot(FRAGMENT.replace('Payload: [', 'Missing: ['));

        expect(() => withSectionFragments('notifications', section(), jest.fn(), root)).toThrow(
            /x-extends Missing names no oneOf/
        );
    });
});

describe('localiseOpenApiReferences', () => {
    const folders: string[] = [];

    afterEach(() => {
        for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
    });

    /** Writes a module's `openapi.yaml` with the given schemas, returning its path. */
    const restFile = (schemas: string): string => {
        const folder = mkdtempSync(path.join(os.tmpdir(), 'localise-refs-'));
        folders.push(folder);
        const file = path.join(folder, 'openapi.yaml');
        writeFileSync(file, `components:\n    schemas:\n${schemas}`);
        return file;
    };

    const REASON = '        Reason:\n            type: string\n            enum: [a, b]\n';
    const REF = "$ref: './openapi.yaml#/components/schemas/Reason'";

    it('copies the referenced schema in before its first user, once, and points both refs at it', () => {
        const fragment = parseDocument(
            `components:\n    schemas:\n        First:\n            properties:\n                why:\n                    ${REF}\n        Second:\n            properties:\n                why:\n                    ${REF}\n`
        );

        localiseOpenApiReferences(fragment, restFile(REASON));

        expect(fragment.toJS()).toEqual({
            components: {
                schemas: {
                    Reason: { type: 'string', enum: ['a', 'b'], 'x-openapi-schema': 'Reason' },
                    First: { properties: { why: { $ref: '#/components/schemas/Reason' } } },
                    Second: { properties: { why: { $ref: '#/components/schemas/Reason' } } }
                }
            }
        });
        expect(Object.keys(fragment.toJS().components.schemas)).toEqual([
            'Reason',
            'First',
            'Second'
        ]);
    });

    it('reads a sibling module’s REST file for a ../<module>/openapi.yaml ref', () => {
        const owner = restFile(REASON);
        // The fragment's own module sits beside the owner and ships no openapi.yaml.
        const ownModule = path.join(path.dirname(path.dirname(owner)), 'shop', 'openapi.yaml');
        const fragment = parseDocument(
            `components:\n    schemas:\n        User:\n            properties:\n                why:\n                    $ref: '../${path.basename(path.dirname(owner))}/openapi.yaml#/components/schemas/Reason'\n`
        );

        localiseOpenApiReferences(fragment, ownModule);

        expect(fragment.toJS().components.schemas.Reason).toEqual({
            type: 'string',
            enum: ['a', 'b'],
            'x-openapi-schema': 'Reason'
        });
        expect(fragment.toJS().components.schemas.User.properties.why).toEqual({
            $ref: '#/components/schemas/Reason'
        });
    });

    it('does not read the REST file when nothing references it', () => {
        const fragment = parseDocument(
            'components:\n    schemas:\n        Only: { type: string }\n'
        );

        expect(() => localiseOpenApiReferences(fragment, '/nowhere/openapi.yaml')).not.toThrow();
    });

    it.each([
        [
            'a schema the REST file does not have',
            '        Other: { type: string }\n',
            /no self-contained schema Reason/
        ],
        [
            'a schema that holds a $ref of its own',
            "        Reason:\n            $ref: '#/components/schemas/Other'\n",
            /no self-contained schema Reason/
        ]
    ])('refuses %s', (_label, rest, message) => {
        const fragment = parseDocument(
            `components:\n    schemas:\n        User:\n            properties:\n                why:\n                    ${REF}\n`
        );

        expect(() => localiseOpenApiReferences(fragment, restFile(rest))).toThrow(message);
    });

    it('refuses a fragment that declares the schema it also references', () => {
        const fragment = parseDocument(
            `components:\n    schemas:\n        Reason: { type: string }\n        User:\n            properties:\n                why:\n                    ${REF}\n`
        );

        expect(() => localiseOpenApiReferences(fragment, restFile(REASON))).toThrow(
            /declares Reason itself/
        );
    });
});

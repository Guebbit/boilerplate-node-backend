import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
    assemblePersonalData,
    readPersonalDataSections,
    stageExportSchema,
    type PersonalDataSection
} from '../../../../scripts/contracts/personal-data-assembly';

/** The owner's stub, as `account/openapi.yaml` keeps it. */
const OWNER = `openapi: 3.1.0
components:
    schemas:
        AccountExportResponse:
            type: object
            required: [exportedAt]
            properties:
                exportedAt:
                    type: string
`;

/** One declared section. */
const section = (over: Partial<PersonalDataSection> = {}): PersonalDataSection => ({
    module: 'widgets',
    key: 'widgets',
    required: true,
    schema: {
        type: 'array',
        items: { $ref: '../widgets/openapi.yaml#/components/schemas/Widget' }
    },
    ...over
});

/** The assembled stub, parsed. */
const stubOf = (text: string) =>
    (
        parseYaml(text) as {
            components: {
                schemas: {
                    AccountExportResponse: {
                        required: string[];
                        properties: Record<string, unknown>;
                    };
                };
            };
        }
    ).components.schemas.AccountExportResponse;

describe('assemblePersonalData', () => {
    it('adds each declared section as a property, and a required one to `required`', () => {
        const stub = stubOf(assemblePersonalData(OWNER, [section()]));

        expect(Object.keys(stub.properties)).toEqual(['exportedAt', 'widgets']);
        expect(stub.required).toEqual(['exportedAt', 'widgets']);
    });

    it('leaves an optional section out of `required`', () => {
        const stub = stubOf(assemblePersonalData(OWNER, [section({ required: false })]));

        expect(stub.properties).toHaveProperty('widgets');
        expect(stub.required).toEqual(['exportedAt']);
    });

    it('is the stub unchanged in meaning when nothing is declared (a module was removed)', () => {
        expect(stubOf(assemblePersonalData(OWNER, []))).toEqual(stubOf(OWNER));
    });

    it('refuses a key two modules both declare', () => {
        expect(() =>
            assemblePersonalData(OWNER, [section(), section({ module: 'gadgets' })])
        ).toThrow(/"widgets" is declared twice — the second is gadgets/);
    });

    it('refuses an owner with no stub', () => {
        expect(() => assemblePersonalData('openapi: 3.1.0\n', [])).toThrow(/declares no/);
    });
});

describe('readPersonalDataSections and stageExportSchema', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(path.join(tmpdir(), 'personal-data-'));
        for (const [name, text] of Object.entries({
            account: OWNER,
            widgets: `x-personal-data:
    widgets:
        schema:
            type: array
            items:
                $ref: '#/components/schemas/Widget'
                other: { $ref: '../../../shared/contracts/openapi.root.yaml#/components/schemas/Id' }
    gizmos:
        required: false
        schema: { type: array, items: { type: string } }
`
        })) {
            mkdirSync(path.join(root, name));
            writeFileSync(path.join(root, name, 'openapi.yaml'), text);
        }
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('reads sections in module order, defaulting `required` to true', () => {
        const sections = readPersonalDataSections(root, ['widgets', 'missing']);

        expect(sections.map(({ key, required }) => [key, required])).toEqual([
            ['widgets', true],
            ['gizmos', false]
        ]);
    });

    it('points an in-file ref at the declaring module and leaves a cross-file one alone', () => {
        const [first] = readPersonalDataSections(root, ['widgets']);

        expect(JSON.stringify(first.schema)).toContain(
            '"$ref":"../widgets/openapi.yaml#/components/schemas/Widget"'
        );
        expect(JSON.stringify(first.schema)).toContain(
            '../../../shared/contracts/openapi.root.yaml#/components/schemas/Id'
        );
    });

    it('rewrites the owner in a staged copy of the tree', () => {
        stageExportSchema(root, root, ['account', 'widgets']);

        expect(
            Object.keys(
                stubOf(readFileSync(path.join(root, 'account', 'openapi.yaml'), 'utf8')).properties
            )
        ).toEqual(['exportedAt', 'widgets', 'gizmos']);
    });

    it('does nothing in a tree without the owner', () => {
        rmSync(path.join(root, 'account'), { recursive: true });

        expect(() => {
            stageExportSchema(root, root, ['widgets']);
        }).not.toThrow();
    });
});

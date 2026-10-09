/**
 * `scripts/ops/demo-remove-contract.ts` run against the REAL root contract, not a hand-written
 * stand-in: the strip once broke silently when a module appended an export section.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { stripAccountExportSchema } from '../../../../scripts/ops/demo-remove-contract';

/** The repository root, where the real contract lives. */
const REAL_ROOT = path.resolve(__dirname, '../../../..');

/** The root contract's location under any repository root. */
const ROOT_CONTRACT = path.join('shared', 'contracts', 'openapi.root.yaml');

/** A throwaway repo root holding a copy of the real root contract. */
let root: string;

/** The parsed export schema of the throwaway root. */
const exportSchema = (): { required: string[]; properties: Record<string, unknown> } =>
    (
        parse(readFileSync(path.join(root, ROOT_CONTRACT), 'utf8')) as {
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

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'demo-remove-contract-'));
    mkdirSync(path.join(root, 'shared', 'contracts'), { recursive: true });
    cpSync(path.join(REAL_ROOT, ROOT_CONTRACT), path.join(root, ROOT_CONTRACT));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('stripAccountExportSchema on the current root contract', () => {
    it('keeps exactly the foundation sections, required and described alike', () => {
        stripAccountExportSchema(root);

        const { required, properties } = exportSchema();

        expect(required).toEqual([
            'exportedAt',
            'profile',
            'roles',
            'addresses',
            'sessions',
            'auditLog',
            'apiKeys'
        ]);
        expect(Object.keys(properties).toSorted()).toEqual([...required, 'feedback'].toSorted());
    });

    it('leaves the rest of the contract as it found it', () => {
        const before = parse(readFileSync(path.join(root, ROOT_CONTRACT), 'utf8')) as {
            components: { schemas: Record<string, unknown> };
        };
        stripAccountExportSchema(root);
        const after = parse(readFileSync(path.join(root, ROOT_CONTRACT), 'utf8')) as {
            components: { schemas: Record<string, unknown> };
        };

        delete before.components.schemas.AccountExportResponse;
        delete after.components.schemas.AccountExportResponse;

        expect(after).toEqual(before);
    });

    it('is a no-op the second time, since the sections are already gone', () => {
        stripAccountExportSchema(root);
        const once = readFileSync(path.join(root, ROOT_CONTRACT), 'utf8');

        stripAccountExportSchema(root);

        expect(readFileSync(path.join(root, ROOT_CONTRACT), 'utf8')).toBe(once);
    });
});

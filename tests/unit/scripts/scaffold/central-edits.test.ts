/**
 * @module
 * The edits outside a module's folder. Run against the REAL files as well as small samples: an
 * anchor that stops existing in a shared file must fail here, not at the first scaffold.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { centralEdits } from '../../../../scripts/scaffold/central-edits';
import { deriveNames } from '../../../../scripts/scaffold/names';
import { REPO_ROOT } from '@tests/paths';

/** The module every case scaffolds. */
const names = deriveNames('scaffold-probe');

/**
 * The edit for one file.
 * @param file - repo-relative path
 * @returns the edit's transform
 */
const editFor = (file: string) => {
    const edit = centralEdits(names).find((candidate) => candidate.path === file);
    if (!edit) throw new Error(`no edit for ${file}`);
    return edit.apply;
};

describe('the four central edits', () => {
    it('touch exactly the files the docs say they do', () => {
        expect(centralEdits(names).map((edit) => edit.path)).toEqual([
            'src/modules.ts',
            'shared/authorization-roles.yaml',
            'shared/authorization-conformance.yaml',
            'tests/cross-cutting/replace-patch-parity.test.ts'
        ]);
    });

    it.each(centralEdits(names).map((edit) => [edit.path, edit] as const))(
        'apply to the real %s',
        (file, edit) => {
            const source = readFileSync(path.join(REPO_ROOT, file), 'utf8');

            expect(edit.apply(source)).not.toBe(source);
        }
    );
});

describe('the admin key lists', () => {
    const yamlList = `roles:
    - name: admin
      permissions: &admin_permissions
          - a.any.read
          - b.any.read

    - name: system
      permissions: *admin_permissions
`;

    it('append the four keys after the last entry, at its indentation', () => {
        expect(editFor('shared/authorization-roles.yaml')(yamlList)).toContain(
            '          - b.any.read\n          - scaffoldprobe.any.read\n          - scaffoldprobe.any.create\n          - scaffoldprobe.any.update\n          - scaffoldprobe.any.delete\n\n    - name: system'
        );
    });

    it('refuse a file whose anchor is gone', () => {
        expect(() => editFor('shared/authorization-roles.yaml')('roles: []\n')).toThrow(/anchor/);
    });
});

describe('the parity canary', () => {
    const table = `        const known: Record<string, string> = {
            Account: 'account',
            Locale: 'locales',
            Product: 'products'
        };
`;

    it('inserts alphabetically by entity, with commas intact', () => {
        const edit = centralEdits(deriveNames('fabrics')).find((candidate) =>
            candidate.path.endsWith('parity.test.ts')
        )?.apply;

        expect(edit?.(table)).toContain(
            "            Account: 'account',\n            Fabric: 'fabrics',\n            Locale: 'locales',"
        );
    });

    it('appends at the end without a trailing comma', () => {
        const edit = centralEdits(deriveNames('zebras')).find((candidate) =>
            candidate.path.endsWith('parity.test.ts')
        )?.apply;

        expect(edit?.(table)).toContain(
            "Product: 'products',\n            Zebra: 'zebras'\n        };"
        );
    });

    it('refuses a file without the table', () => {
        expect(() =>
            editFor('tests/cross-cutting/replace-patch-parity.test.ts')('nothing')
        ).toThrow(/known/);
    });
});

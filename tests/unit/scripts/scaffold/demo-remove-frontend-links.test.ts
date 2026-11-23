/**
 * @module
 * `scripts/scaffold/demo-remove-frontend-links.ts`: a frontend-link row goes with the removed module that was its
 * only user, and stays when a kept file still names it or no file does.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import {
    readRemovedLinkRows,
    stripFrontendLinks
} from '../../../../scripts/scaffold/demo-remove-frontend-links';

/** A throwaway repo root. */
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
 * Read a file back from the throwaway root.
 * @param relative - path from the root
 */
const read = (relative: string): string => readFileSync(path.join(root, relative), 'utf8');

/** The shared file: a core row, two shop rows (one with a comment above it), a shared row, pages. */
const LINKS = `# header
links:
    verify: verify/{token}
    # The order page.
    order: orders/{id}
    product: products/{id}
    terms: terms

staticPages:
    - ''
    - about
    - products

staffPages:
    task: tasks/{id}
    inventory: inventory
    # Summary rows.
    # Two lines of it.
    lowStock: inventory?levels-lowOnly=true
    return: returns/{id}
    shared: shared/{id}
    unused: nowhere
`;

/** The schema's property list, in the shape the real file has. */
const SCHEMA = `export const frontendLinksSchema = z.strictObject({
    links: z.strictObject({
        /** Confirm an e-mail address. */
        verify: template,
        /** One order. */
        order: template,
        /** One product. */
        product: template,
        /** The Terms of Service. */
        terms: template
    }),
    staffPages: z.strictObject({
        /** One task. */
        task: template,
        /** Inventory. */
        inventory: template,
        /** The low-stock board. */
        lowStock: template,
        /** One return. */
        return: template,
        /** Shared. */
        shared: template,
        /** Used by nothing. */
        unused: template
    }),
    staticPages: z.array(z.string())
});
`;

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'demo-remove-frontend-links-'));
    write('shared/rules/frontend-links.yaml', LINKS);
    write('src/infrastructure/config/shared-rules/frontend-links.ts', SCHEMA);
    write('src/modules/orders/config.ts', 'const a = FRONTEND_LINK_RULES.links.order;\n');
    // A lookup by name, as the outcome notice does: the key is a literal in a file that reads the rules.
    write(
        'src/modules/delivery/notice.ts',
        "const page = 'unused2';\nconst t = FRONTEND_LINK_RULES.staffPages[page];\nconst p = { page: 'inventory' };\n"
    );
    write('src/modules/orders/tests/unit/a.test.ts', 'FRONTEND_LINK_RULES.links.verify;\n');
    write(
        'src/modules/products/config.ts',
        'const a = FRONTEND_LINK_RULES.links.product;\nconst b = FRONTEND_LINK_RULES.staffPages.shared;\n'
    );
    write(
        'src/modules/shop-tasks/staff-routing.ts',
        'const PAGES = FRONTEND_LINK_RULES.staffPages;\nconst a = PAGES.lowStock;\nconst b = PAGES.return;\n'
    );
    write(
        'src/modules/account/config.ts',
        'const a = FRONTEND_LINK_RULES.links.verify;\nconst b = FRONTEND_LINK_RULES.staffPages.shared;\n'
    );
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('readRemovedLinkRows', () => {
    it('takes a row only removed modules name, and a page named after a removed module', () => {
        expect(readRemovedLinkRows(root, ['orders', 'products', 'shop-tasks', 'delivery'])).toEqual(
            {
                links: ['order', 'product'],
                staffPages: ['inventory', 'lowStock', 'return'],
                staticPages: ['products']
            }
        );
    });

    it('keeps a row a surviving module still names, one only a test names, and one nothing names', () => {
        const rows = readRemovedLinkRows(root, ['products']);

        // `shared` is named by `account` too; `verify` only by a test of a removed module; `unused` by none.
        expect(rows.staffPages).toEqual([]);
        expect(rows.links).toEqual(['product']);
    });

    it('finds nothing when no frontend-links file exists', () => {
        rmSync(path.join(root, 'shared'), { recursive: true });

        expect(readRemovedLinkRows(root, ['orders'])).toEqual({
            links: [],
            staffPages: [],
            staticPages: []
        });
    });
});

describe('stripFrontendLinks', () => {
    it('drops each row with its own comment, a removed module’s page, and the schema keys', () => {
        const rows = readRemovedLinkRows(root, ['orders', 'products', 'shop-tasks', 'delivery']);

        const notes = stripFrontendLinks(root, rows);

        expect(parse(read('shared/rules/frontend-links.yaml'))).toEqual({
            links: { verify: 'verify/{token}', terms: 'terms' },
            staticPages: ['', 'about'],
            staffPages: { task: 'tasks/{id}', shared: 'shared/{id}', unused: 'nowhere' }
        });
        // The comments of the dropped rows went with them; the header stayed.
        expect(read('shared/rules/frontend-links.yaml')).not.toContain('Summary rows');
        expect(read('shared/rules/frontend-links.yaml')).not.toContain('The order page');
        expect(read('shared/rules/frontend-links.yaml')).toContain('# header');
        const schema = read('src/infrastructure/config/shared-rules/frontend-links.ts');
        expect(schema).not.toMatch(/\b(?:order|product|lowStock|return|inventory): template/);
        expect(schema).toContain('terms: template\n    }),');
        expect(schema).toContain('unused: template\n    }),');
        expect(notes.map((note) => note.file)).toHaveLength(2);
    });

    it('writes nothing when no row is dropped', () => {
        const before = read('shared/rules/frontend-links.yaml');

        expect(stripFrontendLinks(root, { links: [], staffPages: [], staticPages: [] })).toEqual(
            []
        );
        expect(read('shared/rules/frontend-links.yaml')).toBe(before);
    });
});

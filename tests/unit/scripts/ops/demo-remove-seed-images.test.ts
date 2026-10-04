import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeSeedImages } from '../../../../scripts/ops/demo-remove-scenarios';

/** What `scenarios/users.ts` looks like around its avatar spreads. */
const USERS = `import userImages from './users-images.generated.json';
import { makeUser } from '@modules/users/factories';

export const personas = [
    makeUser({
        id: 'a',
        username: 'unverified',
        ...userImages.customer
    }),
    makeUser({
        id: 'b',
        username: 'banned',
        active: false,
        ...userImages.root
    })
];

export const customers = names.map((name, index) =>
    makeUser({
        id: name,
        analyticsConsent: index % 2 === 0,
        ...(index % 2 === 0 ? userImages.root : userImages.customer)
    })
);
`;

const PACKAGE_JSON = `{
    "scripts": {
        "scenario:tls": "tsx scenarios/tools/generate-webhook-sink-tls.ts",
        "scenario:images": "tsx scenarios/tools/generate-seed-images.ts",
        "scenario:apply": "tsx scenarios/apply.ts"
    }
}
`;

/** A throwaway checkout holding just what the step touches. */
let root: string;

/** Write a file under the throwaway root, creating its folder. */
const write = (relative: string, content: string): void => {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
};

/** Read one back. */
const read = (relative: string): string => readFileSync(path.join(root, relative), 'utf8');

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'demo-remove-seed-images-'));
    write('public/images/seed/photo.jpg', 'x');
    write('public/images/seed/thumbs/v1/photo.webp', 'x');
    write('public/images/system/logo.png', 'x');
    write('scenarios/users-images.generated.json', '{}');
    write('scenarios/tools/generate-seed-images.ts', 'export {};');
    write('scenarios/users.ts', USERS);
    write('package.json', PACKAGE_JSON);
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('removeSeedImages', () => {
    it('deletes the whole seed folder, thumbnails included, and nothing beside it', () => {
        removeSeedImages(root);

        expect(existsSync(path.join(root, 'public/images/seed'))).toBe(false);
        expect(existsSync(path.join(root, 'public/images/system/logo.png'))).toBe(true);
    });

    it('deletes the avatar manifest and the generator that wrote it', () => {
        removeSeedImages(root);

        expect(existsSync(path.join(root, 'scenarios/users-images.generated.json'))).toBe(false);
        expect(existsSync(path.join(root, 'scenarios/tools/generate-seed-images.ts'))).toBe(false);
    });

    it('removes the generator’s npm script and only that one', () => {
        removeSeedImages(root);

        const { scripts } = JSON.parse(read('package.json')) as {
            scripts: Record<string, string>;
        };
        expect(Object.keys(scripts)).toEqual(['scenario:tls', 'scenario:apply']);
    });

    it('drops every avatar spread and the import, leaving each user a valid call', () => {
        removeSeedImages(root);

        const users = read('scenarios/users.ts');
        expect(users).not.toMatch(/userImages|users-images/u);
        expect(users).toContain("username: 'unverified'\n    }),");
        expect(users).toContain('active: false\n    })');
        expect(users).toContain('analyticsConsent: index % 2 === 0\n    })');
    });

    it('refuses when the users file no longer imports the manifest', () => {
        write('scenarios/users.ts', 'export const personas = [];\n');

        expect(() => removeSeedImages(root)).toThrow(/expected shape not found/u);
    });
});

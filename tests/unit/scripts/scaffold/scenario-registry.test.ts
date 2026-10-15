import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    DOUBLES_REGISTRY,
    FIXTURE_REGISTRY,
    SCENARIO_REGISTRY,
    renderScenarioRegistries,
    staleScenarioRegistries,
    writeScenarioRegistries
} from '../../../../scripts/scaffold/scenario-registry';

/** Prettier cannot load under Jest, so the registry is compared as generated. */
const identity = (_root: string, _file: string, content: string): Promise<string> =>
    Promise.resolve(content);

/** A throwaway checkout holding the scenario files a registry collects. */
let root: string;

/** Write a file under the throwaway root, creating its folder. */
const write = (relative: string, content = 'export {};\n'): void => {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
};

/** The text of one generated registry, as rendered for the throwaway root. */
const rendered = (file: string): Promise<string> =>
    renderScenarioRegistries(root, identity).then(
        (files) => files.find((each) => each.file === file)?.content ?? ''
    );

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'scenario-registry-'));
    write('scenarios/products.ts', 'export const shopModule = { seed: () => [] };\n');
    write('scenarios/api-keys.ts', 'export const shopModule = { seed: () => [] };\n');
    write('scenarios/accounts.ts', 'export const SEED = 1;\n');
    write('scenarios/shop.scenario.ts', 'export const scenario = { seed: () => [] };\n');
    write(
        'scenarios/support/doubles/payments/register.ts',
        'export const registerDouble = () => {};\n'
    );
    write('scenarios/support/doubles/mail.ts');
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('scenario registries', () => {
    it('collects a fixture file by its `shopModule` export and ignores every other file', async () => {
        const text = await rendered(FIXTURE_REGISTRY);

        expect(text).toContain("import { shopModule as products } from './products';");
        expect(text).toContain("import { shopModule as apiKeys } from './api-keys';");
        expect(text).toContain("'api-keys': apiKeys");
        expect(text).not.toContain('accounts');
        expect(text).not.toContain('scenario as products');
    });

    it('collects a `<name>.scenario.ts` file under its name', async () => {
        const text = await rendered(SCENARIO_REGISTRY);

        expect(text).toContain("import { scenario as shop } from './shop.scenario';");
        expect(text).toContain('export const scenarioFixtures = { shop };');
    });

    it('refuses a scenario file that exports no `scenario`', async () => {
        write('scenarios/odd.scenario.ts');

        await expect(renderScenarioRegistries(root, identity)).rejects.toThrow(
            /odd\.scenario\.ts/u
        );
    });

    it('calls the `registerDouble` of each doubles folder that has a register file', async () => {
        const text = await rendered(DOUBLES_REGISTRY);

        expect(text).toContain(
            "import { registerDouble as paymentsDouble } from './payments/register';"
        );
        expect(text).toContain('= [paymentsDouble];');
    });

    it('drops an entry the moment its file is deleted, with no text to edit', async () => {
        rmSync(path.join(root, 'scenarios/products.ts'));
        rmSync(path.join(root, 'scenarios/shop.scenario.ts'));
        rmSync(path.join(root, 'scenarios/support/doubles/payments'), { recursive: true });

        const fixtures = await rendered(FIXTURE_REGISTRY);
        const scenarios = await rendered(SCENARIO_REGISTRY);
        const doubles = await rendered(DOUBLES_REGISTRY);

        expect(fixtures).not.toContain('products');
        expect(scenarios).not.toContain('shop.scenario');
        expect(scenarios).toContain('export const scenarioFixtures = {  };');
        expect(doubles).not.toContain('payments');
    });

    it('writes the registries once and reports them stale only until then', async () => {
        await expect(staleScenarioRegistries(root, identity)).resolves.toEqual([
            FIXTURE_REGISTRY,
            SCENARIO_REGISTRY,
            DOUBLES_REGISTRY
        ]);

        await expect(writeScenarioRegistries(root, identity)).resolves.toEqual([
            FIXTURE_REGISTRY,
            SCENARIO_REGISTRY,
            DOUBLES_REGISTRY
        ]);

        await expect(staleScenarioRegistries(root, identity)).resolves.toEqual([]);
        await expect(writeScenarioRegistries(root, identity)).resolves.toEqual([]);
        expect(readFileSync(path.join(root, FIXTURE_REGISTRY), 'utf8')).toContain('products');
    });
});

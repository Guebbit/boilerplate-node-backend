/**
 * Subdomain discipline: spend modelling effort where the business is, and nowhere else.
 *
 * DDD's own advice is the part most often skipped — tactical patterns belong in the **core**
 * domain, and supporting and generic subdomains should use the simplest thing that works. Every
 * module now says which of the three it is, and this file is what stops that from being a label
 * nobody acts on:
 *
 *   - a `generic` module may not carry a `domain/` folder. Auth, i18n, audit trails and health
 *     endpoints are solved problems; a pure-rules layer inside one is effort spent on the part of
 *     the system that should be replaceable by something bought.
 *   - the classification itself must stay honest. If every module is core, the field has told us
 *     nothing — so at least one has to be generic and at least one supporting.
 *
 * There is deliberately no rule that a `core` module MUST have a `domain/` folder. `products` is
 * core and has none, because its rules are currently thin enough to live in the service. That is a
 * legitimate state and a fair thing to notice; it is not a violation, and a test that forced the
 * folder would only produce empty ones.
 *
 * In a boilerplate these values are a worked example rather than a finding — a starter kit has no
 * core domain, and the first thing a real project does is re-decide them. The mechanism is the
 * deliverable, not the answers. See `DDD_EXPLORATION.md` §6.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { enabledModules } from '../../src/modules';
import type { Subdomain } from '@kernel/registry';

const MODULES_ROOT = path.join(__dirname, '../../src/modules');

const withSubdomain = (subdomain: Subdomain): string[] =>
    enabledModules.filter((appModule) => appModule.subdomain === subdomain).map(({ name }) => name);

describe('subdomain classification', () => {
    it('classifies every enabled module', () => {
        const unclassified = enabledModules
            .filter((appModule) => !['core', 'supporting', 'generic'].includes(appModule.subdomain))
            .map(({ name }) => name);

        expect(unclassified).toEqual([]);
    });

    it('is not uniformly flattering', () => {
        // The failure this guards against is social, not technical: left to drift, every module
        // becomes core, and the field stops being able to say no to anything.
        expect(withSubdomain('generic').length).toBeGreaterThan(0);
        expect(withSubdomain('supporting').length).toBeGreaterThan(0);
        expect(withSubdomain('core').length).toBeLessThan(enabledModules.length);
    });

    it('keeps a domain layer out of generic subdomains', () => {
        const misplaced = withSubdomain('generic').filter((name) =>
            existsSync(path.join(MODULES_ROOT, name, 'domain'))
        );

        expect(misplaced).toEqual([]);
    });
});

describe('ubiquitous language', () => {
    it('is declared by every module', () => {
        const silent = enabledModules
            .filter((appModule) => Object.keys(appModule.language).length === 0)
            .map(({ name }) => name);

        expect(silent).toEqual([]);
    });

    it('defines terms rather than naming them', () => {
        // A one-word "definition" is a term that was added to satisfy this file. The threshold is
        // low on purpose — it catches placeholders, not terse writing.
        const undefinedTerms = enabledModules.flatMap((appModule) =>
            Object.entries(appModule.language)
                .filter(([, meaning]) => meaning.trim().length < 20)
                .map(([term]) => `${appModule.name}: ${term}`)
        );

        expect(undefinedTerms).toEqual([]);
    });

    it('lets the same word mean different things in different contexts', () => {
        // Not a constraint — a demonstration that the structure permits what a shared glossary
        // cannot. `Soft delete` is withdrawal from sale in `products` and a destroyed account in
        // `users`, and flattening the two into one definition would lose the distinction that
        // makes them separate contexts.
        const byTerm = new Map<string, Set<string>>();
        for (const appModule of enabledModules)
            for (const [term, meaning] of Object.entries(appModule.language))
                byTerm.set(term, (byTerm.get(term) ?? new Set()).add(meaning));

        const shared = [...byTerm].filter(([, meanings]) => meanings.size > 1);
        expect(shared.length).toBeGreaterThan(0);
    });
});

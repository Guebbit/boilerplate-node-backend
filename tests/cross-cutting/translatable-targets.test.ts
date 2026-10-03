/**
 * Every `translatables` manifest entry names a real Mongoose collection and real fields on it.
 *
 * A stale entry here is invisible until a translation write actually happens: nothing else reads
 * `collection`/`fields` before the write path does, so a typo or a renamed field would otherwise
 * surface as a 500 on someone's first translation edit rather than as a failing test.
 */
import mongoose from 'mongoose';
import { resolveTranslatables } from '@kernel/registry';
import { enabledModules } from '../../src/modules';
import { isDeployed } from '@tests/paths';

const translatables = resolveTranslatables(enabledModules);

/** Every registered Mongoose model, by its actual collection name. */
const modelsByCollection = new Map(
    mongoose.modelNames().map((name) => {
        const registeredModel = mongoose.model(name);
        return [registeredModel.collection.name, registeredModel];
    })
);

/** The registered entries — empty when no deployed module owns translatable content. */
const entries = Object.entries(translatables);

describe('the translatables registry', () => {
    // `it.each` rejects an empty table outright, so the two per-entry checks only exist when
    // there is an entry to check.
    if (entries.length > 0) {
        it.each(entries)('%s names a collection an actual model owns', (_entityType, target) => {
            expect(modelsByCollection.has(target!.collection)).toBe(true);
        });

        it.each(entries)(
            "%s names fields the collection's schema actually declares",
            (_entityType, target) => {
                const registeredModel = modelsByCollection.get(target!.collection);
                expect(registeredModel).toBeDefined();

                for (const field of target!.fields)
                    expect(registeredModel!.schema.path(field)).toBeDefined();
            }
        );
    }

    it('has an entry whenever `products`, the module that registers one, is deployed', () => {
        // The canary for the two checks above: an empty registry must mean "nothing translatable
        // is deployed", never "the manifest stopped being read".
        if (isDeployed('products')) expect(entries.length).toBeGreaterThan(0);
    });
});

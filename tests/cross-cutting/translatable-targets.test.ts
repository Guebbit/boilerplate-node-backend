/**
 * Every `translatables` manifest entry names a real Mongoose collection and real fields on it —
 * the shape `module-permissions.test.ts` already uses for permission keys.
 *
 * A stale entry here is invisible until a translation write actually happens: nothing else reads
 * `collection`/`fields` before the write path does, so a typo or a renamed field would otherwise
 * surface as a 500 on someone's first translation edit rather than as a failing test.
 */
import mongoose from 'mongoose';
import { resolveTranslatables } from '@kernel/registry';
import { enabledModules } from '../../src/modules';

const translatables = resolveTranslatables(enabledModules);

/** Every registered Mongoose model, by its actual collection name. */
const modelsByCollection = new Map(
    mongoose.modelNames().map((name) => {
        const registeredModel = mongoose.model(name);
        return [registeredModel.collection.name, registeredModel];
    })
);

describe('the translatables registry', () => {
    it.each(Object.entries(translatables))(
        '%s names a collection an actual model owns',
        (_entityType, target) => {
            expect(modelsByCollection.has(target!.collection)).toBe(true);
        }
    );

    it.each(Object.entries(translatables))(
        "%s names fields the collection's schema actually declares",
        (_entityType, target) => {
            const registeredModel = modelsByCollection.get(target!.collection);
            expect(registeredModel).toBeDefined();

            for (const field of target!.fields)
                expect(registeredModel!.schema.path(field)).toBeDefined();
        }
    );

    it('has at least one entry, so the two checks above are not vacuous', () => {
        expect(Object.keys(translatables).length).toBeGreaterThan(0);
    });
});

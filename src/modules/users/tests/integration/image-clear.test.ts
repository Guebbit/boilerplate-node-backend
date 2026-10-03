/**
 * @module
 * `imageUrl: null` on a user: the field is unset on disk, and the old file and its thumbnail are
 * deleted only once the save has landed. Real files in a temp directory, real store — the point
 * is WHICH files go, which a mocked store cannot say.
 */

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import * as userService from '../../services';
import { userModel } from '../../model';
import { setEnvironment } from '@tests/environment';

setupTestDb();

let root: string;

/** The avatar and thumbnail a finished digest would have left behind. */
const AVATAR = '/images/avatar-abc.png';
const THUMBNAIL = '/images/thumbs/v1/avatar-abc.webp';

beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'image-clear-users-'));
    await mkdir(path.join(root, 'images', 'thumbs', 'v1'), { recursive: true });
    await writeFile(path.join(root, AVATAR), 'avatar');
    await writeFile(path.join(root, THUMBNAIL), 'thumbnail');
    setEnvironment({ NODE_PUBLIC_PATH: root });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/** The stored document as MongoDB holds it, with no Mongoose default applied on the way out. */
const storedRow = (id: string) => userModel.findById(id).lean();

describe('userService.updateById — imageUrl: null', () => {
    it('unsets imageUrl and thumbnailUrl on disk, writing no placeholder', async () => {
        const user = await createUser({ imageUrl: AVATAR, thumbnailUrl: THUMBNAIL });

        await userService.updateById(user.id, { imageUrl: null }, testCallerContext);

        const row = await storedRow(user.id);
        expect(row).not.toHaveProperty('imageUrl');
        expect(row).not.toHaveProperty('thumbnailUrl');
    });

    it('deletes the old file and its thumbnail after the save', async () => {
        const user = await createUser({ imageUrl: AVATAR, thumbnailUrl: THUMBNAIL });

        await userService.updateById(user.id, { imageUrl: null }, testCallerContext);

        expect(existsSync(path.join(root, AVATAR))).toBe(false);
        expect(existsSync(path.join(root, THUMBNAIL))).toBe(false);
    });

    it('leaves the file alone when the update never mentions the image', async () => {
        const user = await createUser({ imageUrl: AVATAR, thumbnailUrl: THUMBNAIL });

        await userService.updateById(user.id, { username: 'renamed' }, testCallerContext);

        expect(existsSync(path.join(root, AVATAR))).toBe(true);
        const row = await storedRow(user.id);
        expect(row?.imageUrl).toBe(AVATAR);
    });

    it('is a no-op for an account that never had an image', async () => {
        const user = await createUser();

        const result = await userService.updateById(user.id, { imageUrl: null }, testCallerContext);

        expect(result.success).toBe(true);
        expect(await storedRow(user.id)).not.toHaveProperty('imageUrl');
    });
});

import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lookup } from 'mime-types';
import path from 'node:path';
import { logger } from './winston';

/**
 *
 * @param metaUrl
 */
export const getFileUrl = (metaUrl: string) => {
    const filename = fileURLToPath(metaUrl); // __filename
    const dirname = path.dirname(__filename); // __dirname
    return { filename, dirname };
};

/**
 *
 * @param metaUrl
 */
export const getFilename = (metaUrl: string) => getFileUrl(metaUrl).filename;

/**
 *
 * @param metaUrl
 */
export const getDirname = (metaUrl: string) => getFileUrl(metaUrl).dirname;

/**
 * Delete target file in the filesystem
 * @param filePath
 */
export function deleteFile(filePath: string) {
    // check if file exists
    return (
        fs
            .stat(filePath)
            // delete it
            .then(() => fs.unlink(filePath))
            .then(() => true)
            .catch((error) => {
                // file doesn't exists
                if ((error as (Error & { code?: string }) | undefined)?.code === 'ENOENT')
                    return false;
                // Other error occurred: log error
                logger.error({
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
                return false;
            })
    );
}

/**
 * Get base64 of target file
 * Better to be used with images (but not restricted to)
 *
 * @param filePath
 */
export function fileToBase64(filePath: string) {
    return fs
        .readFile(filePath, { encoding: 'base64' })
        .then((fileBuffer) => {
            const lookupString = lookup(filePath);
            if (lookupString) return 'data:' + lookupString + ';base64,' + fileBuffer;
        })
        .catch(() => '');
}

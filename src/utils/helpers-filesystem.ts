import { fileURLToPath } from 'node:url';
import { deleteFile as toolkitDeleteFile } from '@guebbit/js-toolkit';
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
export const getDirname = (metaUrl: string) => getFileUrl(metaUrl).dirname;

/**
 * Delete target file in the filesystem, logging unexpected failures
 * @param filePath
 */
export const deleteFile = (filePath: string) =>
    toolkitDeleteFile(filePath, (error) =>
        logger.error({
            message: error.message,
            stack: error.stack,
            name: error.name
        })
    );

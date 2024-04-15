import { promises as fs } from "fs";
import logger from "./winston";

/**
 * Delete target file in the filesystem
 * @param filePath
 */
export function deleteFile(filePath: string) {
    // check if file exists
    return fs.stat(filePath)
        // delete it
        .then(() => fs.unlink(filePath))
        .then(() => true)
        .catch(error => {
            // file doesn't exists
            if(error.code === 'ENOENT')
                return false;
            // Other error occurred: log error
            logger.error(error);
            return false;
        });
}
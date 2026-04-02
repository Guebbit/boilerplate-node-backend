import { sequelize, syncSchema } from '../../src/utils/database';

export const connect = async () => {
    await syncSchema(true);
};

export const disconnect = async () => {
    await sequelize.close();
};

export const clearAll = async () => {
    await syncSchema(true);
};

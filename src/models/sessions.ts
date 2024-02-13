import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model
} from 'sequelize';
import db from "../utils/db";

class Sessions extends Model<InferAttributes<Sessions>, InferCreationAttributes<Sessions>> {
    declare sid: CreationOptional<number>;
    declare expires: Date;
    declare data: Date;
}

Sessions.init(
    {
        sid: {
            type: DataTypes.STRING,
            primaryKey: true,
        },
        expires: DataTypes.DATE,
        data: DataTypes.STRING(50000)
    },
    {
        sequelize: db,
        tableName: 'sessions'
    }
);

export default Sessions;
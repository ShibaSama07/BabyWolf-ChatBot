import { Sequelize, DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";

const sequelize = new Sequelize({
    storage: 'data.sqlite',
    dialect: 'sqlite',
    logging: false
})

export interface IFCAU_ChannelMap extends Model<InferAttributes<IFCAU_ChannelMap>, InferCreationAttributes<IFCAU_ChannelMap>> {
    channelID: string;
    threadID: string;
    data: {
        enableGlobalThreads: boolean;
        allowThreads: string[];
        denyThreads: string[];
    }
}

export interface IFCAU_Thread extends Model<InferAttributes<IFCAU_Thread>, InferCreationAttributes<IFCAU_Thread>> {
    threadID: string;
    threadName: string;
}

export const ChannelMap = sequelize.define<IFCAU_ChannelMap>('ChannelMaps', {
    channelID: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    threadID: {
        type: DataTypes.STRING
    },
    data: {
        type: DataTypes.JSON
    }
}, {
    timestamps: false
})

export const Thread = sequelize.define<IFCAU_Thread>('Threads', {
    threadID: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    threadName: {
        type: DataTypes.STRING
    }
}, {
    timestamps: false
})

ChannelMap.sync({ force: false });
Thread.sync({ force: false });
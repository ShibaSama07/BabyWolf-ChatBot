import { Sequelize, DataTypes } from "sequelize";
import { IFCAU_ChannelMap, IFCAU_Thread } from "../type";

const sequelize = new Sequelize({
    storage: 'data.sqlite',
    dialect: 'sqlite',
    logging: false
})

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
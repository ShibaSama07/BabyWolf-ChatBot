import { Sequelize, DataTypes } from "sequelize";
import { DB_ChannelMap, DB_Thread } from "../type";
import { Controller } from "./controller.js";

const sequelize = new Sequelize({
    storage: 'data.sqlite',
    dialect: 'sqlite',
    logging: false
})

export const ChannelMap = sequelize.define<DB_ChannelMap>('ChannelMaps', {
    channelID: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    threadID: {
        type: DataTypes.STRING
    },
    allow: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    webhookURL: {
        type: DataTypes.STRING
    }
}, {
    timestamps: false
})

export const Thread = sequelize.define<DB_Thread>('Threads', {
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

export const controller = new Controller();

await ChannelMap.sync({ force: false });
await Thread.sync({ force: false });
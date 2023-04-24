import { ChannelMap } from "../index.js";

export default function ChannelMapModel() {
    async function getData(where: { channelID?: string, threadID?: string }) {
        try {
            let data = await ChannelMap.findOne({ where });
            return data?.dataValues;
        } catch (e) {
            console.error(e);
        }
    }

    async function updateData(where: { channelID?: string, threadID?: string }, allow: boolean) {
        try {
            await ChannelMap.update({ allow }, { where });
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    async function createData(values: { channelID: string, threadID: string, allow: boolean, webhookURL: string }) {
        try {
            let data = await ChannelMap.create(values);
            return data.dataValues;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    async function destroyData(where: { channelID?: string, threadID?: string }) {
        try {
            await ChannelMap.destroy({ where });
        } catch (e) {
            console.error(e);
        }
    }

    return {
        getData,
        updateData,
        createData,
        destroyData
    }
}
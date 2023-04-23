import { Thread } from "../index.js";

export default function ThreadModel() {
    async function getData(where: { threadID: string }) {
        try {
            let data = await Thread.findOne({ where });
            if(!data) return false;
            return data.dataValues
        } catch (e) {
            console.error(e);
        }
    }

    async function updateData(threadName: string, threadID: string) {
        try {
            await Thread.update({ threadName }, { where: { threadID } })
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    async function createData(values: { threadID: string, threadName: string }) {
        try {
            let data = await Thread.create(values);
            return data.dataValues
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    async function destroyData(where: { threadID?: string, threadName?: string}) {
        try {
            await Thread.destroy({ where });
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
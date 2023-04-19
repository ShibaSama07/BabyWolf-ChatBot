import { Client, Collection, Interaction, type SlashCommandBuilder } from "discord.js";
import { Model, type InferAttributes, type InferCreationAttributes } from "sequelize"
import type { Controller } from "./database/controller";

type CommandArgs = {
    client: ExtendClient
    interaction: Interaction
    controller: Controller
}

type CommandType = {
    config: SlashCommandBuilder,
    execute: ({ client, interaction, controller }: CommandArgs) => Promise<void> | void;
}

export class Command {
    private _config: CommandType["config"]
    private _execute: CommandType["execute"]
    constructor(option: CommandType) {
        this._config = option.config
        this._execute = option.execute
    }

    get config() {
        return this._config
    }

    get execute() {
        return this._execute
    }
}

export class ExtendClient extends Client {
    commands = new Collection<string, CommandType>();
}

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
import { Client, Collection, CommandInteraction, type SlashCommandBuilder } from "discord.js";
import { Model, type InferAttributes, type InferCreationAttributes } from "sequelize"
import type { Controller } from "./database/controller";

type CommandArgs = {
    client: ExtendClient
    interaction: CommandInteraction
    controller: Controller,
    config: ConfigType
}

type CommandType = {
    config: SlashCommandBuilder,
    execute: ({ client, interaction, controller, config }: CommandArgs) => Promise<void> | void;
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

export interface DB_ChannelMap extends Model<InferAttributes<DB_ChannelMap>, InferCreationAttributes<DB_ChannelMap>> {
    channelID: string;
    threadID: string;
    allow: boolean;
    webhookURL: string;
}

export interface DB_Thread extends Model<InferAttributes<DB_Thread>, InferCreationAttributes<DB_Thread>> {
    threadID: string;
    threadName: string;
}

export type ConfigType = {
    NAME: string;
    RICH_PRESENCE: {
        TYPE: string;
        CONTENT: string;
        STATUS: string;
    };
    enableGlobalThreads: boolean;
};
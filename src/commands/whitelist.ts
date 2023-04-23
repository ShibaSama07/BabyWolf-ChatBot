import { Command } from "../type.js";
import { SlashCommandBuilder } from "discord.js";
import { writeFile } from "fs/promises";
import path from "path";

export default new Command({
    config: new SlashCommandBuilder()
        .setName("global")
        .setDescription("Enable/disable thread whitelist")
        .setDescriptionLocalizations({
            "en-US": "Enable/disable thread whitelist",
            "en-GB": "Enable/disable thread whitelist",
            "vi": "Bật/tắt danh sách cho phép hoạt động"
        }),
    execute: async ({ interaction, controller, config }) => {
        if(!interaction.guild) return;
        if(!interaction.channel) return;

        await interaction.deferReply({ ephemeral: true });

        config.enableGlobalThreads = !config.enableGlobalThreads;
        await writeFile(path.join(process.cwd(), "config.json"), JSON.stringify(config, null, "\t"));

        await interaction.editReply(
            interaction.locale === "vi" ?
                "Đã " + (config.enableGlobalThreads ? "bật" : "tắt") + " danh sách cho phép hoạt động." :
                (config.enableGlobalThreads ? "Enabled" : "Disabled") + " thread whitelist."
        );
    }
})
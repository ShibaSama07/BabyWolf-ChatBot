import { Command } from "../type.js";
import { SlashCommandBuilder } from "discord.js";

export default new Command({
    config: new SlashCommandBuilder()
        .setName("block")
        .setDescription("Block bots to work in thread")
        .setDescriptionLocalizations({
            "en-US": "Block bots to work in thread",
            "en-GB": "Block bots to work in thread",
            "vi": "Chặn bot hoạt động ở nhóm"
        }),
    execute: async ({ interaction, controller }) => {
        if(!interaction.guild) return;
        if(!interaction.channel) return;

        await interaction.deferReply({ ephemeral: true });

        const { channelId } = interaction;
        let thread = await controller.ChannelMap.getData({ channelID: channelId });
        if(thread) {
            await controller.ChannelMap.updateData({ channelID: channelId }, false);
            await interaction.editReply({ content: "Data import successful!" })
        } else {
            await interaction.editReply({ content: "Can't not found channel data" })
        }
    }
})
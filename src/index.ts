import { PresenceStatusData, REST, Routes } from "discord.js";
import { Client as FB_client } from "fca-utils";
import handleEvent from "./handleEvent.js";
import { ExtendClient } from "./type.js";
import { readdirSync } from "fs";
import type { Command } from "./type.js";

const dc_client = new ExtendClient({
    intents: ["MessageContent", "Guilds", "DirectMessages", "GuildMessages"]
})

const fb_client = new FB_client({
    prefix: process.env.PREFIX
})

await Promise.all([
    fb_client.loginWithAppState(process.env.APPSTATE_BASE64!, { selfListen: false }),
    dc_client.login(process.env.TOKEN)
])

dc_client.once('ready', async () => {

    console.log(`[ DC ] Logged in as ${dc_client.user?.tag}`);

    const allComand = readdirSync("./commands");
    for (let path of allComand) {
        const command: Command = (await import("./commands" + path)).default;
        dc_client.commands.set(command.config.name, command);
    }

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN!);
    try {
        console.log(`Started refreshing ${[...dc_client.commands.keys()].length} application (/) commands.`);
        const data = await rest.put(
            Routes.applicationCommands(dc_client.user!.id),
            {
                body: dc_client.commands.map((v) => {
                    return v.config.toJSON();
                })
            },
        ) as any[];

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);

        dc_client.user?.setUsername(process.env.NAME!);

        const ActivityTypeOptions = [
            { name: "competing", type: 5 },
            { name: "custom", type: 4, },
            { name: "listening", type: 2 },
            { name: "playing", type: 0 },
            { name: "streaming", type: 1 },
            { name: "watching", type: 3 }
        ]

        const ActivityType = process.env["RICH_PRESENCE.TYPE"]

        dc_client.user?.setPresence({
            activities: [
                {
                    name: process.env["RICH_PRESENCE.CONTENT"],
                    type: ActivityTypeOptions.find(e => e.name === ActivityType)?.type
                }
            ],
            status: (process.env["RICH_PRESENCE.STATUS"] as PresenceStatusData)
        })
    } catch (e) {
        console.error(e);
    }
})

fb_client.once('ready', (_, bid) => {
    console.log(`[ FB ] Logged in as ${bid}`);
})

handleEvent({ dc_client, fb_client });
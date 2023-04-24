import {
  ChannelType,
  OverwriteType,
  WebhookClient,
  type Guild,
  type WebhookMessageCreateOptions
} from "discord.js";
import { TextMessage, Client as fb_client } from "fca-utils";
import { controller } from "./database/index.js";
import type { ConfigType, ExtendClient } from "./type.js";
import { getStream } from "./utils.js";

type HandleEventOption = {
  dc_client: ExtendClient;
  fb_client: fb_client;
  config: ConfigType
};

type CreateChannelOption = {
  guild: Guild;
  threadID: string;
  threadName: string;
  client: ExtendClient;
  config: ConfigType;
};

type FbMessageOption = {
  body: string;
  attachment?: any | any[];
};

async function createChannel({
  guild,
  threadID,
  threadName,
  client,
  config
}: CreateChannelOption) {
  try {
    let cate = guild.channels.cache.find(
      (c) =>
        c.name.toLowerCase() === "facebook" &&
        c.type === ChannelType.GuildCategory
    );

    if (!cate) return;

    const channel = await guild?.channels.create({
      name: threadName,
      type: ChannelType.GuildText,
      parent: cate.id,
      permissionOverwrites: [
        {
          id: process.env.ADMINID!,
          type: OverwriteType.Member,
          allow: ["ViewChannel", "SendMessages"],
        },
        {
          id: client.user?.id!,
          type: OverwriteType.Member,
          allow: ["ViewChannel", "SendMessages", "ManageChannels"],
        },
        {
          id: process.env.GUILDID!,
          deny: ["ViewChannel"],
        },
      ],
    });

    let webhook = await channel.createWebhook({ name: config.NAME });

    if (!(await controller.Thread.getData({ threadID }))) {
      await controller.Thread.createData({ threadID, threadName });

      console.log("Created data for thread " + threadID);
    }

    await controller.ChannelMap.createData({ channelID: channel?.id!, threadID: threadID, allow: true, webhookURL: webhook.url });

    console.log("Created channel " + channel.id);
  } catch (e) {
    console.error(e);
  }
}

async function destroyData(where: { channelID?: string, threadID?: string }) {
  try {
    await Promise.all([
      controller.ChannelMap.destroyData(where),
    ]);

    console.log("Deleted data " + Object.values(where).join(" "));
  } catch (e) {
    console.error(e);
  }
}

async function handleMessage(message: TextMessage) {
  let options: WebhookMessageCreateOptions = {};
  options.username = message.senderID;
  options.avatarURL = `https://graph.facebook.com/${message.senderID}/picture?type=large&width=500&height=500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
  options.content = message.body;
  options.files = message.attachments.map(x => {
    return x.url;
  });

  return options;
}

export default async function handleEvent({
  dc_client,
  fb_client,
  config
}: HandleEventOption) {
  var guild = await dc_client.guilds.fetch(process.env.GUILDID!);

  dc_client.on("messageCreate", async (message) => {
    try {
      if (!guild) guild = await dc_client.guilds.fetch(process.env.GUILDID!);
      if (message.guildId != process.env.GUILDID) return;
      let channel = await controller.ChannelMap.getData({ channelID: message.channelId });

      if (!channel) return;
      if (!config.enableGlobalThreads && !channel.allow) return;

      if (message.author.bot) return;
      let option: FbMessageOption = {
        body: `${message.content}\n\n${message.author.tag}`,
      };

      let attachments = Array.from(message.attachments.values());

      if (attachments.length != 0) {
        option.attachment = [];
        for (let atm of attachments) {
          option.attachment.push(await getStream(atm.url));
        }
      }

      fb_client
        .getApi()
        ?.sendMessage(option as unknown as string, channel.threadID)
        .catch((e) => console.error(e));
    } catch (e) {
      console.error(e);
    }
  });

  dc_client.on("interactionCreate", interaction => {
    if (interaction.isCommand()) {
      try {
        let commandName = interaction.commandName;
        let command = dc_client.commands.get(commandName)!;
        let option = {
          client: dc_client,
          interaction: interaction,
          controller,
          config
        }

        command.execute(option);
      } catch (e) {
        console.error(e)
      }
    }
  })

  dc_client.on("channelDelete", async (channel) => {
    try {
      await destroyData({ channelID: channel.id });
    } catch (e) {
      console.error(e);
    }
  });

  fb_client.on("message", async (message) => {
    try {
      let thread = await controller.ChannelMap.getData({ threadID: message.threadID })
      
      if (!config.enableGlobalThreads && !thread?.allow) return;
      if (!guild) guild = await dc_client.guilds.fetch(process.env.GUILDID!);

      if (!thread) {
        let threadName =
          (await controller.Thread.getData({ threadID: message.threadID }))?.threadName ||
          (await fb_client.getApi()?.getThreadInfo(message.threadID))?.threadName ||
          "Facebook User " + message.threadID;

        await createChannel({
          guild,
          threadID: message.threadID,
          threadName,
          client: dc_client,
          config
        });
      } else {
        const channel = await guild.channels.fetch(thread.channelID)
          .catch(async (e) => {
            await destroyData({ channelID: thread!.channelID })
            throw e;
          });

        if (channel?.isTextBased()) {
          const options = await handleMessage(message);
          let webhook = new WebhookClient({ url: thread.webhookURL });
          await webhook.send(options);
        }
      }
    } catch (e) {
      console.error(e);
    }
  });

  fb_client.on("event", async (event) => {
    try {
      const thread = await controller.ChannelMap.getData({ threadID: event.threadID });

      if (!config.enableGlobalThreads && !thread?.allow) return;
      if (!thread) {
        let threadName =
          (await controller.Thread.getData({ threadID: event.threadID }))?.threadName ||
          (await fb_client.getApi()?.getThreadInfo(event.threadID))?.threadName ||
          "Facebook User " + event.threadID;

        await createChannel({
          guild,
          threadID: event.threadID,
          threadName,
          client: dc_client,
          config
        });
      }

      if (event.logMessageType === "log:subscribe") {
        fb_client
          .getApi()
          ?.changeNickname(
            config.NAME,
            event.threadID,
            event.author
          );
      }
      if (event.logMessageType === "log:unsubscribe") {
        if (await controller.ChannelMap.getData({ threadID: event.threadID })) {
          await destroyData({ threadID: event.threadID });
        }
      }

      if (event.logMessageType === "log:thread-name") {
        if (thread) {
          let channelID = (await controller.ChannelMap.getData({ threadID: event.threadID }))!.channelID;
          const channel = await guild.channels.fetch(channelID)
            .catch(async () => {
              await destroyData({ channelID: channelID });
              return;
            })

          let name = event.logMessageData.name;
          await channel?.edit({ name })

          console.log("Edited name channel " + channelID + " to " + name);
        }
      }
    } catch (e) {
      console.error(e);
    }
  });


  // restart process
  setInterval(() => {
    console.log("Restart process!");
    process.exit(1);
  }, 1000 * 60 * 60);
}
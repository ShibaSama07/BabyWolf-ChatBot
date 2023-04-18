import { ChannelMap, Thread } from "./database/index.js";
import {
  ChannelType,
  EmbedBuilder,
  MessagePayload,
  OverwriteType,
} from "discord.js";
import type { Client as dc_client, Guild } from "discord.js";
import { Client as fb_client, TextMessage } from "fca-utils";
import { getStream } from "./utils.js";

type HandleEventOption = {
  dc_client: dc_client;
  fb_client: fb_client;
};

type FbMessageOption = {
  content?: string;
  embeds?: EmbedBuilder[];
  files?: {
    attachment: unknown;
    name: string;
  }[];
};

type CreateChannelOption = {
  guild: Guild;
  threadID: string;
  threadName: string;
  client: dc_client;
};

type DcMessageOption = {
  body: string;
  attachment?: any | any[];
};

const defaultData = {
  enableGlobalThreads: true,
  allowThreads: [],
  denyThreads: []
}

async function createChannel({
  guild,
  threadID,
  threadName,
  client,
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

    if (!(await Thread.findOne({ where: { threadID } }))) {
      await Thread.create({ threadID, threadName });

      console.log("Created data for thread " + threadID);
    }

    await ChannelMap.create({ channelID: channel?.id!, threadID: threadID, data: defaultData });

    console.log("Created channel " + channel.id);
  } catch (e) {
    console.error(e);
  }
}

async function destroyData(where: { channelID?: string, threadID?: string }) {
  try {
    await Promise.all([
      ChannelMap.destroy({
        where
      }),
    ]);

    console.log("Deleted data " + Object.values(where).join(" "));
  } catch (e) {
    console.error(e);
  }
}

async function handleMessage(message: TextMessage) {
  let options: FbMessageOption = {};
  let { attachments } = message;

  let embed = new EmbedBuilder()
    .setColor("Random")
    .setFooter({
      text: `From ${message.senderID}\nIn ${message.threadID}`,
      iconURL: `https://graph.facebook.com/${message.senderID}/picture?type=large&width=500&height=500&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
    })
    .setTimestamp();
  if (attachments.length == 1) {
    if (
      attachments[0].type === "photo" ||
      attachments[0].type === "sticker" ||
      attachments[0].type === "animated_image"
    ) {
      embed.setImage(attachments[0].url);
      options.embeds = [embed];
    } else if (
      attachments[0].type === "video" ||
      attachments[0].type === "audio"
    ) {
      if (
        attachments[0].type === "audio" &&
        getExt(attachments[0].url) === ".mp4"
      ) {
        embed.setDescription(".mp4 format audio files are not supported");
        options.embeds = [embed];
      } else {
        options.files = [
          { attachment: attachments[0].url, name: attachments[0].filename },
        ];
        options.content =
          message.body + `\n\nFrom ${message.senderID}\nIn ${message.threadID}`;
      }
    } else {
      embed.setDescription("(location, file or share)");
      options.embeds = [embed];
    }
  } else if (attachments.length > 1) {
    options.files = [];
    for (let atm of attachments) {
      if (
        atm.type === "location" ||
        atm.type === "file" ||
        atm.type === "share" ||
        (atm.type === "audio" && getExt(atm.url) == ".mp4")
      )
        continue;
      options.files.push({
        attachment: atm.url,
        name: atm.ID + getExt(atm.url)[0],
      });
    }
    options.content =
      message.body + `\n\nFrom ${message.senderID}\nIn ${message.threadID}`;
  } else {
    embed.setDescription(message.body != "" ? message.body : " ");
    options.embeds = [embed];
  }

  return options;
}

function getExt(url: string) {
  let matchUrl = url.substring(url.lastIndexOf("/")).match(/([^.]+)\?/g)![0];
  return "." + matchUrl.slice(matchUrl.length * -1, -1);
}

export default async function handleEvent({
  dc_client,
  fb_client,
}: HandleEventOption) {
  var channelMap = await ChannelMap.findAll();
  var threads = await Thread.findAll();
  var guild = await dc_client.guilds.fetch(process.env.GUILDID!);

  dc_client.on("messageCreate", async (message) => {
    try {
      if (!guild) guild = await dc_client.guilds.fetch(process.env.GUILDID!);
      if (message.guildId != process.env.GUILDID) return;
      const channel = channelMap.find(
        (e) => e.dataValues.channelID == message.channelId
      );
      if (!channel) return;
      if (message.author.bot) return;
      let option: DcMessageOption = {
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

  dc_client.on("channelDelete", async (channel) => {
    try {
      await destroyData({ channelID: channel.id });
      channelMap = await ChannelMap.findAll();
    } catch (e) {
      console.error(e);
    }
  });

  fb_client.on("message", async (message) => {
    try {
      if (!guild) guild = await dc_client.guilds.fetch(process.env.GUILDID!);
      const thread = channelMap.find(
        (e) => e.dataValues.threadID == message.threadID
      );
      if (!thread) {
        let threadName = threads.find(
          (e) => e.dataValues.threadID == message.threadID
        )?.dataValues.threadName || (await fb_client.getApi()?.getThreadInfo(message.threadID))?.threadName || "Facebook User " + message.threadID;
        await createChannel({
          guild,
          threadID: message.threadID,
          threadName,
          client: dc_client,
        });

        channelMap = await ChannelMap.findAll();
        threads = await Thread.findAll();
      } else {
        const channel = await guild.channels.fetch(thread.dataValues.channelID)
          .catch(async () => {
            await destroyData({ channelID: thread.dataValues.channelID })
            channelMap = await ChannelMap.findAll();
            return;
          })
        if (channel?.isTextBased()) {
          const options = await handleMessage(message);
          await channel.send(options as unknown as MessagePayload);
        }
      }
    } catch (e) {
      console.error(e);
    }
  });

  fb_client.on("event", async (event) => {
    try {
      if (event.logMessageType === "log:subscribe") {
        const thread = await ChannelMap.findOne({
          where: { threadID: event.threadID },
        });
        if (!thread) {
          let threadName = threads.find(
            (e) => e.dataValues.threadID == event.threadID
          )?.dataValues.threadName || (await fb_client.getApi()?.getThreadInfo(event.threadID))?.threadName || "Facebook User " + event.threadID;
          await createChannel({
            guild,
            threadID: event.threadID,
            threadName,
            client: dc_client,
          });

          channelMap = await ChannelMap.findAll();
          threads = await Thread.findAll();
        }

        fb_client
          .getApi()
          ?.changeNickname(
            process.env.NAME as string,
            event.threadID,
            event.author
          );
      }
      if (event.logMessageType === "log:unsubscribe") {
        if (await ChannelMap.findOne({ where: { threadID: event.threadID } })) {
          await destroyData({ threadID: event.threadID });
          channelMap = await ChannelMap.findAll();
        }
      }

      if (event.logMessageType === "log:thread-name") {
        let thread = threads.find(
          (e) => e.dataValues.threadID == event.threadID
        );

        if (!thread) {
          let threadName = threads.find(
            (e) => e.dataValues.threadID == event.threadID
          )?.dataValues.threadName || (await fb_client.getApi()?.getThreadInfo(event.threadID))?.threadName || "Facebook User " + event.threadID;
          await createChannel({
            guild,
            threadID: event.threadID,
            threadName,
            client: dc_client,
          });

          channelMap = await ChannelMap.findAll();
          threads = await Thread.findAll();
        } else {
          let channelID = (await ChannelMap.findOne({ where: { threadID: event.threadID } }))!.dataValues.channelID;
          const channel = await guild.channels.fetch(channelID)
            .catch(async () => {
              await destroyData({ channelID: channelID })
              channelMap = await ChannelMap.findAll();
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
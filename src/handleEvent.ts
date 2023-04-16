import { ChannelMap, Thread } from "./database/index.js";
import {
  ChannelType,
  EmbedBuilder,
  GuildBasedChannel,
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
  cate: GuildBasedChannel;
  client: dc_client;
};

type DcMessageOption = {
  body: string;
  attachment?: any | any[];
};

async function createChannel({
  guild,
  threadID,
  threadName,
  cate,
  client,
}: CreateChannelOption) {
  try {
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

    await ChannelMap.create({ channelID: channel?.id!, threadID: threadID });

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
        let cate = guild.channels.cache.find(
          (c) =>
            c.name.toLowerCase() === "facebook" &&
            c.type === ChannelType.GuildCategory
        );

        if (!cate) return;

        let threadName = threads.find(
          (e) => e.dataValues.threadID == message.threadID
        )?.dataValues.threadName || (await fb_client.getApi()?.getThreadInfo(message.threadID))?.threadName || "Facebook User " + message.threadID;
        await createChannel({
          guild,
          threadID: message.threadID,
          threadName,
          cate,
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
          let cate = guild.channels.cache.find(
            (c) =>
              c.name.toLowerCase() === "facebook" &&
              c.type === ChannelType.GuildCategory
          );
          if (!cate) return;

          let threadName = threads.find(
            (e) => e.dataValues.threadID == event.threadID
          )?.dataValues.threadName || (await fb_client.getApi()?.getThreadInfo(event.threadID))?.threadName || "Facebook User " + event.threadID;
          await createChannel({
            guild,
            threadID: event.threadID,
            threadName,
            cate,
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
    } catch (e) {
      console.error(e);
    }
  });

  setInterval(() => {
    console.log("Restart process!");
    process.exit(1);
  }, 1000 * 60 * 60);
}

/*
form event

{
  threadID: '4324694514301550',
  threadName: 'Box Trầm Zn✨',
  participantIDs: [
    '100005031336921', '100012225789622',
    '100014964135149', '100015739746003',
    '100016043793782', '100016361979184',
    '100023569054347', '100030627933799',
    '100036638302088', '100037046643333',
    '100038412221686', '100038686965220',
    '100042009152032', '100042233929145',
    '100042716979113', '100048304354594',
    '100048541215949', '100050436931680',
    '100050572665784', '100050904308150',
    '100060225133703', '100067622181533',
    '100071797088406', '100076035439731',
    '100077087021834', '100077384121298',
    '100077385713279', '100081180038814',
    '100088690480323'
  ],
  userInfo: [
    {
      id: '100005031336921',
      name: 'Trần Phương Bình',
      firstName: 'Bình',
      vanity: 'binhtran2612',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/331049616_1327862634614122_6633611037962110395_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=104&ccb=1-7&_nc_sid=7206a8&_nc_ohc=bNSyMcB81a8AX_z8IrR&_nc_ht=scontent.fhan15-2.fna&oh=00_AfDew-5Up7pqh2qSRiRWxFB9ApyKqihG76LcZPxdFKhxMw&oe=64415B28',
      profileUrl: 'https://www.facebook.com/binhtran2612',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100012225789622',
      name: 'Bùi Nguyên',
      firstName: 'Bùi',
      vanity: 'bui.nguyen.127648',
      thumbSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t39.30808-1/341057825_962299734951435_5352964297658465637_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=109&ccb=1-7&_nc_sid=7206a8&_nc_ohc=xLLZCqi_b_MAX-YwIEd&_nc_ht=scontent.fhan15-1.fna&oh=00_AfBWS_pdI23Z8KAEjMt6IJ8E6vmYrTaipF49KcMsBWoBxA&oe=6441009D',
      profileUrl: 'https://www.facebook.com/bui.nguyen.127648',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100014964135149',
      name: 'Nguyễn Trần Vân Anh',
      firstName: 'Anh',
      vanity: 'vanhnehehee',
      thumbSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t39.30808-1/341088411_242693954920136_3884709735876828827_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=105&ccb=1-7&_nc_sid=f67be1&_nc_ohc=b67sjaHNK4MAX92Kx0R&_nc_ht=scontent.fhan15-1.fna&oh=00_AfC1UtCBNH2bikFO1YUu0KKYKDsSYaaXkxg7ZslLlo0r1A&oe=6441901F',
      profileUrl: 'https://www.facebook.com/vanhnehehee',
      gender: 'FEMALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100015739746003',
      name: 'Quoc Huy',
      firstName: 'Huy',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t39.30808-1/340471957_1708039136287847_4820922463708088608_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=106&ccb=1-7&_nc_sid=f67be1&_nc_ohc=O0FVL2vdlp8AX-u5KPN&_nc_ht=scontent.fhan15-1.fna&oh=00_AfCfmk2sO1EmSjbTN7pwsPVQLhMnf7g8O1adyno1UcVANA&oe=6440B767',
      profileUrl: 'https://www.facebook.com/profile.php?id=100015739746003',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100016043793782',
      name: 'Van Anh',
      firstName: 'Anh',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/335141539_1170201403684082_8099783061968438888_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=110&ccb=1-7&_nc_sid=7206a8&_nc_ohc=G5RBg2WbOcwAX8qO6xs&_nc_ht=scontent.fhan15-2.fna&oh=00_AfCZX2xYqympyK3Vk1Lqg8hQKoz0Sbwl_JvAfTRrqV83iQ&oe=6441A923',
      profileUrl: 'https://www.facebook.com/profile.php?id=100016043793782',
      gender: 'FEMALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100016361979184',
      name: 'Đỗ Phượng',
      firstName: 'Phượng',
      vanity: 'Pya05',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t1.30497-1/143086968_2856368904622192_1959732218791162458_n.png?stp=cp0_dst-png_p60x60&_nc_cat=1&ccb=1-7&_nc_sid=7206a8&_nc_ohc=4WG6vRsKhfwAX-XZBcs&_nc_ht=scontent.fhan15-2.fna&oh=00_AfBiQZnbGjsizy6wquZw2xoTvJXDUaFh-rYs4ZWbPgbz4g&oe=64636138',
      profileUrl: 'https://www.facebook.com/Pya05',
      gender: 'FEMALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100023569054347',
      name: 'Nhan Pham',
      firstName: 'Nhan',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t39.30808-1/321462577_704826004547692_2633641487714192688_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=105&ccb=1-7&_nc_sid=7206a8&_nc_ohc=aVWJ1fABthsAX-qa2qH&_nc_ht=scontent.fhan15-1.fna&oh=00_AfCgjEZboiwQ_jCykOkeOT0Tf3yaULC__qkXMrL7vdKWxQ&oe=64419D18',
      profileUrl: 'https://www.facebook.com/profile.php?id=100023569054347',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100030627933799',
      name: 'Thuý Uyên',
      firstName: 'Thuý',
      vanity: 'uyn.uyn.345',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/339078541_1384492772405426_8583126732655828942_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=100&ccb=1-7&_nc_sid=7206a8&_nc_ohc=tPL_h8eRRKQAX-YNxDM&_nc_oc=AQlggVsFOSiNHyMCJ1gCbOiVRZ6cjdjTY0aBjU2I4LqD8cQ-uPuiSGvSwyEUqPDrlj91hm46UPBej50mkQVYJivM&_nc_ht=scontent.fhan15-2.fna&oh=00_AfCmTpGWK2-dCSs5LnLoJL5v45hi9GnR9RInn1X84hpAlA&oe=64401790',
      profileUrl: 'https://www.facebook.com/uyn.uyn.345',
      gender: 'FEMALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100036638302088',
      name: 'Bảo Bình',
      firstName: 'Bình',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t1.30497-1/143086968_2856368904622192_1959732218791162458_n.png?stp=cp0_dst-png_p60x60&_nc_cat=1&ccb=1-7&_nc_sid=7206a8&_nc_ohc=4WG6vRsKhfwAX-XZBcs&_nc_ht=scontent.fhan15-2.fna&oh=00_AfBiQZnbGjsizy6wquZw2xoTvJXDUaFh-rYs4ZWbPgbz4g&oe=64636138',
      profileUrl: 'https://www.facebook.com/profile.php?id=100036638302088',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100037046643333',
      name: 'Văn Hoà',
      firstName: 'Hoà',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/330462065_852235859211402_3512704107694173998_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=104&ccb=1-7&_nc_sid=7206a8&_nc_ohc=gT6xiMvKm0YAX_VN6K1&_nc_ht=scontent.fhan15-2.fna&oh=00_AfBB0Kvs-n2hEoYM0OuUSPaUoSDtev_5dnjrsoblfyB47w&oe=6440670A',
      profileUrl: 'https://www.facebook.com/profile.php?id=100037046643333',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100038412221686',
      name: 'Hiếu Lê',
      firstName: 'Lê',
      vanity: 'Sherlock.Holmes.Wibu',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/338597580_768218384581213_7699616924152532072_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=104&ccb=1-7&_nc_sid=7206a8&_nc_ohc=5v8F6ELQwWUAX-aa71g&_nc_ht=scontent.fhan15-2.fna&oh=00_AfBgF_V1tEltDbuKG9b3oye0umgjxaFSRhB8NgH8WkV-XA&oe=6441879D',
      profileUrl: 'https://www.facebook.com/Sherlock.Holmes.Wibu',
      gender: 'FEMALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100038686965220',
      name: 'Phạm Công Lâm',
      firstName: 'Lâm',
      vanity: 'lam.phamcong.543',
      thumbSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t39.30808-1/329008350_1179205726094809_416366918292317671_n.jpg?stp=c1.0.60.60a_cp0_dst-jpg_p60x60&_nc_cat=109&ccb=1-7&_nc_sid=7206a8&_nc_ohc=NYG0fAXG3aUAX-6_fc6&_nc_ht=scontent.fhan15-1.fna&oh=00_AfCU2RT4BhmnCyJQCqUacq8BVkq6GEbguqJR5iohScWrcQ&oe=64401862',
      profileUrl: 'https://www.facebook.com/lam.phamcong.543',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100042009152032',
      name: 'Trần Văn Trường',
      firstName: 'Trường',
      vanity: 'shibasama.dev',
      thumbSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t39.30808-1/279529694_746929096717389_1303097993265152426_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=105&ccb=1-7&_nc_sid=7206a8&_nc_ohc=E3lN5o7Cf3IAX-QqrSX&_nc_ht=scontent.fhan15-1.fna&oh=00_AfA5qenaJyC5bMBbYTzjWN-gLyZoXZorEFaxOS04cOi0xA&oe=64418D3D',
      profileUrl: 'https://www.facebook.com/shibasama.dev',
      gender: 'MALE',
      type: 'User',
      isFriend: true,
      isBirthday: false
    },
    {
      id: '100042233929145',
      name: 'Ngô Mạnh',
      firstName: 'Mạnh',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t39.30808-1/335030538_106590615705759_4524558059539394172_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=101&ccb=1-7&_nc_sid=7206a8&_nc_ohc=qbJWzQT2Z4sAX-Yc0BR&_nc_ht=scontent.fhan15-1.fna&oh=00_AfDVWww5RxBKj1cIbG1k2v2IHvOGtML_Wn98KEAMdZfS6A&oe=6440219D',
      profileUrl: 'https://www.facebook.com/profile.php?id=100042233929145',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100042716979113',
      name: 'Du Họ Lò',
      firstName: 'Du',
      vanity: 'lothedu.ct.vl.07',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/341457236_139508692415006_2129087887291589692_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=100&ccb=1-7&_nc_sid=7206a8&_nc_ohc=ftQy5K7XoL8AX-ln5cp&_nc_ht=scontent.fhan15-2.fna&oh=00_AfAq690XFo1s0tVY_w9Iq16Q6KuJhKEwa1CiYX2yp-IBVA&oe=64416CB7',
      profileUrl: 'https://www.facebook.com/lothedu.ct.vl.07',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100048304354594',
      name: 'Facebook User',
      firstName: undefined,
      vanity: undefined,
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t1.30497-1/85215299_479381239411958_7755129104415850496_n.jpg?stp=c18.0.60.60a_cp0_dst-jpg_p60x60&_nc_cat=1&ccb=1-7&_nc_sid=f6a805&_nc_ohc=tGm1ubUmnwYAX-abpUv&_nc_ht=scontent.fhan15-2.fna&oh=00_AfBNS3el06jgOYrPmsEmPB67Jbo1z1PHOJ8up9B06HPL7Q&oe=64636096',
      profileUrl: null,
      gender: undefined,
      type: 'UnavailableMessagingActor',
      isFriend: undefined,
      isBirthday: false
    },
    {
      id: '100048541215949',
      name: 'Tiến Đạt',
      firstName: 'Đạt',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/341465113_544950394459133_2937421776516150512_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=104&ccb=1-7&_nc_sid=7206a8&_nc_ohc=DswJ7VaEMawAX_m33JW&_nc_ht=scontent.fhan15-2.fna&oh=00_AfD1r2OFsdX121Tj9762O3Qe5uFwjDU6epqsANqs2mWnPA&oe=644107BA',
      profileUrl: 'https://www.facebook.com/profile.php?id=100048541215949',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100050436931680',
      name: 'ファム・カイン・ キー',
      firstName: 'キー',
      vanity: 'PCKye',
      thumbSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t39.30808-1/340624242_892541048713118_3815004961547792081_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=106&ccb=1-7&_nc_sid=7206a8&_nc_ohc=u4jv8l79QzwAX_LVYru&_nc_ht=scontent.fhan15-1.fna&oh=00_AfCPJDHmDG-9d06KA6YAdPgfYfGd6vpP7PenWYr0xijJow&oe=644048D0',
      profileUrl: 'https://www.facebook.com/PCKye',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100050572665784',
      name: 'Ninh Hinh',
      firstName: 'Hinh',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/337366793_192750750162721_6688259156935600933_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=103&ccb=1-7&_nc_sid=7206a8&_nc_ohc=0p77-aKOKK8AX87-8_t&_nc_ht=scontent.fhan15-2.fna&oh=00_AfBymY3o7aX1radwry2LmGw739Y2ByW6lPifQgt-h65JvA&oe=6441B798',
      profileUrl: 'https://www.facebook.com/profile.php?id=100050572665784',
      gender: 'FEMALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100050904308150',
      name: 'Nguyễn Vinh',
      firstName: 'Vinh',
      vanity: 'Hades.280601',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/340848487_2356062987907295_1634004454218837649_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=104&ccb=1-7&_nc_sid=7206a8&_nc_ohc=nzRz0pzTtUIAX8H2K6K&_nc_ht=scontent.fhan15-2.fna&oh=00_AfBRQYk7GsYrvs-nw-qVqUbcIOk093h9DrI4gwJphYLrsA&oe=6440D6FC',
      profileUrl: 'https://www.facebook.com/Hades.280601',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100060225133703',
      name: 'Chanh Chanh',
      firstName: 'Chanh',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/271870387_323395303011305_291113275582700434_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=111&ccb=1-7&_nc_sid=7206a8&_nc_ohc=rCKPUrcgXeYAX8yaxTM&_nc_ht=scontent.fhan15-2.fna&oh=00_AfBkzXylyXm81S5x1u9GoAvbNc3egQYgCRtYHbaYbl_LgQ&oe=64412992',
      profileUrl: 'https://www.facebook.com/profile.php?id=100060225133703',
      gender: 'FEMALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100067622181533',
      name: 'Nguyễn Hoàng Việt',
      firstName: 'Việt',
      vanity: 'HoangViet0506',
      thumbSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t39.30808-1/340110265_235627795664780_2748319496133379938_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=105&ccb=1-7&_nc_sid=7206a8&_nc_ohc=bD7AODFjAfkAX9tsHNE&_nc_ht=scontent.fhan15-1.fna&oh=00_AfD4kvGFQM1cGQmheQw3QjizAO3NsYn3ufpC3k0jWI4Cog&oe=643FDCD3',
      profileUrl: 'https://www.facebook.com/HoangViet0506',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100071797088406',
      name: 'Nguyễn Trung Kiên',
      firstName: 'Kiên',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t1.30497-1/143086968_2856368904622192_1959732218791162458_n.png?stp=cp0_dst-png_p60x60&_nc_cat=1&ccb=1-7&_nc_sid=7206a8&_nc_ohc=4WG6vRsKhfwAX-XZBcs&_nc_ht=scontent.fhan15-2.fna&oh=00_AfBiQZnbGjsizy6wquZw2xoTvJXDUaFh-rYs4ZWbPgbz4g&oe=64636138',
      profileUrl: 'https://www.facebook.com/profile.php?id=100071797088406',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100076035439731',
      name: 'Cak Con',
      firstName: 'Cak',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/245768637_119256277285553_75634009045448778_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=107&ccb=1-7&_nc_sid=7206a8&_nc_ohc=Fw1WPu8SDfoAX-J7YHv&_nc_ht=scontent.fhan15-2.fna&oh=00_AfC3IO3b1kCjfSuXUmTzeeji3p1skWcKJyLjPWnEPMmq3w&oe=6440726B',
      profileUrl: 'https://www.facebook.com/profile.php?id=100076035439731',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100077087021834',
      name: 'Anh Tram',
      firstName: 'Anh',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/279663163_144565771456323_4170273781558655863_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=110&ccb=1-7&_nc_sid=7206a8&_nc_ohc=TWR0OTO2OecAX8W4Naf&_nc_ht=scontent.fhan15-2.fna&oh=00_AfDQf3QQs5hgbvEQ7ws_uSuZG-hQ2xCKnauaSytQpuFQlg&oe=6440DAD0',
      profileUrl: 'https://www.facebook.com/profile.php?id=100077087021834',
      gender: 'FEMALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100077384121298',
      name: 'Nguyễn Nhi',
      firstName: 'Nhi',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t39.30808-1/340911249_1192982624690024_4945646833418214836_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=101&ccb=1-7&_nc_sid=7206a8&_nc_ohc=sqWrdY6raQUAX96n6Q5&_nc_ht=scontent.fhan15-1.fna&oh=00_AfAUfWKqzUMUS9RnwRUdn94wnOCRTO7boMUB2q3SqJJYcA&oe=643FFFFF',
      profileUrl: 'https://www.facebook.com/profile.php?id=100077384121298',
      gender: 'FEMALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100077385713279',
      name: 'Facebook User',
      firstName: undefined,
      vanity: undefined,
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t1.30497-1/85215299_479381239411958_7755129104415850496_n.jpg?stp=c18.0.60.60a_cp0_dst-jpg_p60x60&_nc_cat=1&ccb=1-7&_nc_sid=f6a805&_nc_ohc=tGm1ubUmnwYAX-abpUv&_nc_ht=scontent.fhan15-2.fna&oh=00_AfBNS3el06jgOYrPmsEmPB67Jbo1z1PHOJ8up9B06HPL7Q&oe=64636096',
      profileUrl: null,
      gender: undefined,
      type: 'UnavailableMessagingActor',
      isFriend: undefined,
      isBirthday: false
    },
    {
      id: '100081180038814',
      name: 'Mun Nguyen',
      firstName: 'Mun',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/338348169_1254878985120179_4447902132455765914_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=104&ccb=1-7&_nc_sid=7206a8&_nc_ohc=hWyCCZ6s4kMAX_L1WQP&_nc_ht=scontent.fhan15-2.fna&oh=00_AfDkc6EqlBjc3CP0RI4WMXeCZMXMMB1nSiYDOfACoqgiFA&oe=64400303',
      profileUrl: 'https://www.facebook.com/profile.php?id=100081180038814',
      gender: 'MALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    },
    {
      id: '100088690480323',
      name: 'Facebook User',
      firstName: undefined,
      vanity: undefined,
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t1.30497-1/85215299_479381239411958_7755129104415850496_n.jpg?stp=c18.0.60.60a_cp0_dst-jpg_p60x60&_nc_cat=1&ccb=1-7&_nc_sid=f6a805&_nc_ohc=tGm1ubUmnwYAX-abpUv&_nc_ht=scontent.fhan15-2.fna&oh=00_AfBNS3el06jgOYrPmsEmPB67Jbo1z1PHOJ8up9B06HPL7Q&oe=64636096',
      profileUrl: null,
      gender: undefined,
      type: 'UnavailableMessagingActor',
      isFriend: undefined,
      isBirthday: false
    }
  ],
  unreadCount: 2,
  messageCount: 70266,
  timestamp: '1681645425024',
  muteUntil: -1,
  isGroup: true,
  isSubscribed: true,
  isArchived: false,
  folder: 'INBOX',
  cannotReplyReason: null,
  eventReminders: [],
  emoji: '🐸',
  color: '0B0085',
  nicknames: {
    '100005031336921': 'TC• ng tàng hình',
    '100012225789622': 'TC• Nino (05)( dân chơi oxi)',
    '100014244947654': 'TC• Trưởng Lão (97)',
    '100014542839793': 'TC• ILoveU(07)',
    '100014964135149': 'TC•Lizzy (03) (Co-Leader)',
    '100015081158361': 'TC• Hoàng Yến🐉(04)',
    '100015209023341': 'TC• Bách (05)',
    '100015739746003': 'TC•Nguyn (05)',
    '100016043793782': 'TC•Ttam (06)',
    '100016361979184': 'TC•PhuowgbồDieeep👀(07)',
    '100017642227581': 'TC•V.Hùng(09)',
    '100017851025437': 'TC•Lonhh:3 (07)',
    '100018540354786': 'TC• Ánh k6',
    '100023064561299': 'TC•Sharon(10)',
    '100023238375764': 'TC•3♤(2k)',
    '100023569054347': 'TC• Suy(07)',
    '100023787374077': 'TC•『SW』•ʟʏɴɴ〆',
    '100024519511081': 'TC•Quình (06)',
    '100025483440592': 'TC•Đen(06)',
    '100025808690167': 'TC• Long (2k5 )',
    '100025856439579': 'TC• Nai sừ (05)',
    '100026380043996': 'TC• nhi (08)',
    '100026864941413': 'TC•thành(06)',
    '100027333845773': 'TC•HíuTốcĐộ(05)',
    '100028443464924': 'TC• Cún (03)',
    '100028873547111': 'TC•CamiiGoSPiii',
    '100030627933799': 'TC• Uynngu (05)',
    '100031355025095': 'TC•Hiền(07)',
    '100032033311100': 'TC•BestPholo(06)',
    '100032729389388': 'TC• Huỳnh Kiệtk4',
    '100033747754037': 'TC•Vân(02)',
    '100034410913459': 'TC•My(02)',
    '100034489569553': 'TC• Quang (07)',
    '100034750364216': 'TC• Chau ngu',
    '100035048221912': 'TC• ʚthuwuyyyɞ (06)',
    '100036524588228': 'TC• Thành đầy VỢ 😏 (04)',
    '100036638302088': 'TC•gà nhất gr rồi (06)',
    '100036730309102': 'Tịnh tâm tu hành',
    '100037046643333': 'TC•Hoà Văn',
    '100037323314228': 'TC•Tuu (05)',
    '100037987426997': 'TC• huy (08)',
    '100038113176912': 'TC• Bozs Hảd (k11)',
    '100038225853387': 'TC• An (09)',
    '100038412221686': 'Hieudepchai',
    '100038686965220': 'TC• Lâm (08)',
    '100039812735274': 'TC •NONN(08)',
    '100040832477664': 'TC•Cheems(08)',
    '100041707262016': 'TC•LinkTorem (022)',
    '100041911560759': 'TC• giàu (04)',
    '100042009152032': 'TC• TruongMini (09)',
    '100042233929145': 'TC• Masow✘cóvợ (06)',
    '100042588680425': 'TC• SiniterCryo (08)',
    '100042716979113': 'TC•DuHụtHoa (007)',
    '100042724192869': 'TC•LongThầnThánh (06)',
    '100042878059431': 'TC•THIÊN 08 of đến tết :((',
    '100043903891060': 'TC• Nam nửa mùa (01)',
    '100044366985832': 'TC• Name (NS)',
    '100044566814673': 'TC•Hoangsadboiz:)',
    '100044662403403': 'TC• Tú Anh (07)',
    '100044672985339': 'TC•Achu (04)',
    '100045082283729': 'TC• Vàng (07)',
    '100045164930245': 'TC•Phúc 05',
    '100045560389307': 'TC•Flash(05)',
    '100047618259713': 'TC• Ara (06)',
    '100048083852357': 'TC•Hằng94',
    '100048143147938': 'TC• Như Quỳnnh(k6)',
    '100048207068551': 'TC•Nghị đẹp gái (08)',
    '100048207547556': 'TC•TrunggKien (07)',
    '100048304354594': 'TC• Minh❤️Nhi(ka 12 nka )',
    '100048448728820': 'TC• Dũngdzaivcl (07)',
    '100048541215949': 'đạt-( đốc tờ ti lấm)',
    '100048884078524': 'TC• Linh (05)',
    '100049193522149': 'TC• Nguyên (06)',
    '100049636757515': 'TC• Tuấn (07)',
    '100049834565549': 'TC•Thái (06)',
    '100049932452401': 'TC•D.Vũ(06)',
    '100050436931680': 'TC• Kỳ (06)',
    '100050572665784': 'qa',
    '100050904308150': 'TC•Thầy Vinn Dạy Yêu (01)(Cê Ô Lít đờ) (mãi bịp)',
    '100051619627324': 'TC• vương',
    '100051797538037': 'TC• vinnhh (06)',
    '100051886997435': 'TC• ToBiiCóNy(07)',
    '100052076795914': 'TC• ebe 🐛',
    '100052161392605': 'TC•Yu(06)',
    '100052372600873': 'TC•Kumo',
    '100052775091705': 'TC• Khánh (07)',
    '100053054414432': 'TC•Phong(08)',
    '100053060680088': 'TC• Tulen (NS)',
    '100053969442119': 'TC. 𐒅ỿ_𝐧ΐ𝕖⚘(05)',
    '100054151052447': 'TC•Fương FBI (08)',
    '100054158321540': 'TC• Kiên',
    '100054414986124': 'TC•TìnhHơiDảk(K5)',
    '100054453682609': 'TC• Bảo (08)',
    '100054517306715': 'TC • Huy (08)',
    '100054767423492': 'TC• Hưng ʟᴇмoɴ[05]',
    '100054886629720': '[ > ] • Boss',
    '100055292986663': 'TC•๖²⁴ʱᴀɴᴜʙɪsッ (07)',
    '100055567924175': 'TC• Âu dương (07)',
    '100055569017201': 'TC• Wibu (7)',
    '100056604799156': 'TC• Orsted (05)',
    '100056667295612': 'TC•SadBoizz (06)',
    '100056866351683': 'TC• Lâm (2k10)',
    '100056965196015': 'TC• Hải (07)',
    '100057359603359': 'TC•cương wibu (2k)',
    '100057469580281': 'TC• Bảo (05)',
    '100058713518837': 'TC• NB (06)',
    '100059399036957': 'TC•ILoveU (07)',
    '100060187842853': 'TC• KwenTín(05)',
    '100060225133703': 'TC• qanh 08',
    '100060857772970': 'TC• Na (05)',
    '100060955595002': 'TC• Tlinh (04)',
    '100061618783275': 'TC• Bin [06]',
    '100061741172213': 'TC• tuấn(04)',
    '100062163176777': 'TC • Ben (05)',
    '100062766880936': 'TC•Vũ01',
    '100062918112367': 'TC•Đức(08)',
    '100063198212141': 'TC• Nhân (07)  phake',
    '100063494256760': 'TC• Itsuki(06)',
    '100063736087700': 'TC•Lê(06)',
    '100063736895113': 'TC• DieeepbồPhuowng',
    '100063819907628': 'TC•Till (07)',
    '100064016356747': 'TC• Lê Đạt (08)',
    '100064075486970': 'TC•Đạt YTB•Top 1 Paine(2002)',
    '100064086195732': 'Tc•Tink (06)',
    '100064612320226': 'TC• Nhung',
    '100064719566622': 'TC• Hgiang (05)',
    '100064833584228': 'TC• Phuong 🥀 ( 02 )',
    '100065312229721': 'TC• =))))) (07)',
    '100066573288972': 'TC• Pascal is easy (08)',
    '100066675049963': 'TC•Jack (05)',
    '100066758468596': 'TC• Gia Han (09)',
    '100067406867171': 'TC• Phongg (05)',
    '100067432939573': 'TC• PéMy (09)',
    '100067622181533': 'TC•Hviet(01)Lít đờ',
    '100068332553812': 'TC• Tlinh (08)',
    '100068421218156': 'TC• Tài (06)',
    '100068555798299': 'TC•Lâm Dốc Cơ (06)',
    '100068583901197': 'TC•Hà(karr5)',
    '100068612410995': 'TC•Nнι вéт иαтα k7😼',
    '100068677268122': 'TC• đạt (06)',
    '100068690395532': 'TC•Kun(04)',
    '100069376620436': 'TC• Tâm k6',
    '100069706387953': 'TC• Trang (08)',
    '100069794460303': 'TC•Huonk (08)',
    '100069913426555': 'TC• Linh(05)',
    '100070258172447': 'TC• Ngưn (06)',
    '100070551304872': 'TC• FloOneChamp(06)',
    '100070667963718': 'TC• Nguyet',
    '100070683970248': 'TC• Bống 🫶 (08)',
    '100071117899919': "TC• Thái (07) Kil'groth",
    '100071705862379': 'TC•Tân(06)',
    '100071718914678': 'TC•học sinh nghèo vượt khó (04)',
    '100072153609095': 'TC• Huy (02)',
    '100072293576273': 'TC• My( 2k6)',
    '100072526123702': 'TC• Chin (01)',
    '100072709590801': 'TC•Sang(08)',
    '100072795577819': 'TC Nhân :)))(07)',
    '100072968242051': 'TC• thỏ (03)',
    '100073006693928': 'TC• Name (NS)',
    '100073030885535': 'TC• Vanitas (07) real',
    '100073114167955': 'TC• Sang (2k8)',
    '100073129017192': 'TC•TrươngGia',
    '100073129896372': 'TC•Mon(07)',
    '100073442861804': 'TC•Quang (08)',
    '100073450489445': 'TC•Ýn(k7)',
    '100073512416079': 'TC•Chiken',
    '100073732123019': 'TC• Shin xin zata (09)',
    '100073758168760': 'TC• Minh (09)',
    '100073822890039': 'TC• ebesâu (09)',
    '100073929436793': 'TC• hiểu(07)',
    '100073989517559': 'TC • Tam Esul (07)',
    '100074052166336': 'TC• Trân (09)',
    '100074100133763': 'TC•Lan(08)',
    '100074175607383': 'TC • N.Hân (06)',
    '100074182911812': 'TC• lợi (97)',
    '100074260090352': 'TC• BéMớiTậpChơi 09',
    '100074270063721': 'TC. Gà Gù(96)',
    '100074328303996': 'TC• danhhh(09)',
    '100074855167777': 'TC• LyLuvDũg (03)',
    '100074895210030': 'TC• Duy (09)',
    '100075005198178': 'TC•Quanganh .-.(09)off nốt tuần này',
    '100075225392523': 'TC• Gia Hòa (07)',
    '100075297570638': 'TC•  Anh(K7)',
    '100075332776435': 'TC•ánhnguyên(06)',
    '100075438938723': 'TC• Tuấn (06)',
    '100075444702029': 'TC• Sơn (01)',
    '100075659173559': 'TC•hnam(07)',
    '100076035439731': '[!] [Bot]',
    '100076055215897': 'TC• ThầygiáoZata(08)',
    '100076116596694': 'TC•Thιêη (09)',
    '100076199724550': 'TC• TQuang(08)',
    '100076314223747': 'ღTC↭๖ۣۜLùnヅ『kar7』',
    '100076316983433': 'TC•ĐiNgủNha (05)',
    '100076330303889': 'TC• Bống (08)',
    '100077087021834': '[ ?, !, . ] Xavia',
    '100077384121298': 'TC•Nhi❤️Minh(08)',
    '100077385713279': 'Xavia Bot',
    '100078828286390': 'TC• hlinh(06)',
    '100078929712557': 'TC•ILoveU(07)',
    '100079254193830': 'TC• Boy Ms Lớn (08)',
    '100079376209642': 'TC•ĐứcK6 Top flo',
    '100079474748068': 'TC•lonminh(07)',
    '100079649131305': 'TC•Rize(06)',
    '100081180038814': 'TC• Mun (01)',
    '100081975764561': 'ngu mà nói lắm v ?'
  },
  adminIDs: [
    { id: '100042009152032' },
    { id: '100048541215949' },
    { id: '100050436931680' },
    { id: '100050904308150' },
    { id: '100067622181533' },
    { id: '100076035439731' },
    { id: '100077385713279' }
  ],
  approvalMode: false,
  approvalQueue: [],
  reactionsMuteMode: 'reactions_not_muted',
  mentionsMuteMode: 'mentions_not_muted',
  isPinProtected: false,
  relatedPageThread: null,
  name: 'Box Trầm Zn✨',
  snippet: '🐸',
  snippetSender: '100042009152032',
  snippetAttachments: [],
  serverTimestamp: '1681645425024',
  imageSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t1.15752-9/319063990_2030776480452658_7572884150592064200_n.jpg?_nc_cat=108&ccb=1-7&_nc_sid=02e273&_nc_ohc=uRRzxpXHwpUAX-qKGuQ&_nc_oc=AQlvC-TKNbDPKZrD_6LwxtqSXciP7WBtk9e2sfWBZjiEZfM55QA85mIx722z_fmaEVhOmrIW5aI-wZiljWFj_pBv&_nc_ht=scontent.fhan15-1.fna&oh=03_AdRI8U1I6GdcXyYz4Rzlin_33XWIDw2fLXzRI0ZJ303R8A&oe=64636B3C',
  isCanonicalUser: false,
  isCanonical: false,
  recipientsLoadable: true,
  hasEmailParticipant: false,
  readOnly: false,
  canReply: true,
  lastMessageTimestamp: undefined,
  lastMessageType: 'message',
  lastReadTimestamp: '1681645141882',
  threadType: 2
}
{
  threadID: '100042009152032',
  threadName: null,
  participantIDs: [ '100042009152032', '100077087021834' ],
  userInfo: [
    {
      id: '100042009152032',
      name: 'Trần Văn Trường',
      firstName: 'Trường',
      vanity: 'shibasama.dev',
      thumbSrc: 'https://scontent.fhan15-1.fna.fbcdn.net/v/t39.30808-1/279529694_746929096717389_1303097993265152426_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=105&ccb=1-7&_nc_sid=7206a8&_nc_ohc=E3lN5o7Cf3IAX-QqrSX&_nc_ht=scontent.fhan15-1.fna&oh=00_AfA5qenaJyC5bMBbYTzjWN-gLyZoXZorEFaxOS04cOi0xA&oe=64418D3D',
      profileUrl: 'https://www.facebook.com/shibasama.dev',
      gender: 'MALE',
      type: 'User',
      isFriend: true,
      isBirthday: false
    },
    {
      id: '100077087021834',
      name: 'Anh Tram',
      firstName: 'Anh',
      vanity: '',
      thumbSrc: 'https://scontent.fhan15-2.fna.fbcdn.net/v/t39.30808-1/279663163_144565771456323_4170273781558655863_n.jpg?stp=cp0_dst-jpg_p60x60&_nc_cat=110&ccb=1-7&_nc_sid=7206a8&_nc_ohc=TWR0OTO2OecAX8W4Naf&_nc_ht=scontent.fhan15-2.fna&oh=00_AfDQf3QQs5hgbvEQ7ws_uSuZG-hQ2xCKnauaSytQpuFQlg&oe=6440DAD0',
      profileUrl: 'https://www.facebook.com/profile.php?id=100077087021834',
      gender: 'FEMALE',
      type: 'User',
      isFriend: false,
      isBirthday: false
    }
  ],
  unreadCount: 20,
  messageCount: 389,
  timestamp: '1681645558759',
  muteUntil: null,
  isGroup: false,
  isSubscribed: true,
  isArchived: false,
  folder: 'INBOX',
  cannotReplyReason: null,
  eventReminders: [],
  emoji: null,
  color: null,
  nicknames: {},
  adminIDs: [],
  approvalMode: false,
  approvalQueue: [],
  reactionsMuteMode: 'reactions_not_muted',
  mentionsMuteMode: 'mentions_not_muted',
  isPinProtected: false,
  relatedPageThread: null,
  name: null,
  snippet: '󰀀',
  snippetSender: '100042009152032',
  snippetAttachments: [],
  serverTimestamp: '1681645558759',
  imageSrc: null,
  isCanonicalUser: false,
  isCanonical: true,
  recipientsLoadable: true,
  hasEmailParticipant: false,
  readOnly: false,
  canReply: true,
  lastMessageTimestamp: undefined,
  lastMessageType: 'message',
  lastReadTimestamp: '1681581137176',
  threadType: 1
}
*/
import ChannelMapModel from "./controllers/channelmap.js";
import ThreadModel from "./controllers/thread.js";

export class Controller {
    ChannelMap = ChannelMapModel()
    Thread = ThreadModel()
}
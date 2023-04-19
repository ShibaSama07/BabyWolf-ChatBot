import ChannelMapModel from "./controllers/channelmap";
import ThreadModel from "./controllers/thread";

export class Controller {
    ChannelMap = ChannelMapModel()
    Thread = ThreadModel()
}
import { registerWebDiscovery } from "./web-discovery";
import { startActivityHeartbeat } from "./activity-heartbeat";
import { registerScreenSelectionMessages } from "./screen-selection";

startActivityHeartbeat();
registerScreenSelectionMessages();

registerWebDiscovery();

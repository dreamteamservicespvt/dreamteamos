import { registerPlugin } from "@capacitor/core";

interface AudioRoutePlugin {
  setSpeakerOn(options: { enabled: boolean }): Promise<void>;
  isSpeakerOn(): Promise<{ enabled: boolean }>;
  reset(): Promise<void>;
}

const AudioRoute = registerPlugin<AudioRoutePlugin>("AudioRoute");

export default AudioRoute;

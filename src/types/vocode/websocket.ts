import type { TranscriberConfig } from "./transcriber";
import type { AgentConfig } from "./agent";
import type { SynthesizerConfig } from "./synthesizer";
import { AudioEncoding } from "./audioEncoding";

export type WebSocketMessageType =
  | "websocket_start"
  | "websocket_audio"
  | "websocket_transcript"
  | "websocket_ready"
  | "websocket_stop"
  | "websocket_audio_config_start";

export interface WebSocketMessage {
  type: WebSocketMessageType;
}

export interface StartMessage extends WebSocketMessage {
  type: "websocket_start";
  transcriberConfig: TranscriberConfig;
  agentConfig: AgentConfig;
  synthesizerConfig: SynthesizerConfig;
  conversationId?: string;
}

export interface InputAudioConfig {
  samplingRate: number;
  audioEncoding: AudioEncoding;
  chunkSize: number;
  downsampling?: number;
}

export interface OutputAudioConfig {
  samplingRate: number;
  audioEncoding: AudioEncoding;
}

export type ConversationData = {
  user_id?: any, //string,
  user_first_name?: any, // string,
  user_last_name?: any, // string,
  user_interests?: any, // string[],
  deeva_profile_id?: any, // string,
  deeva_memories?: any, // string,
  deeva_name?: any, // string,
  deeva_relationship_type?: any, // string,
  deeva_interests?: any, // string[]
  deeva_voice_name?: any, // string
  partner_should_be?: any // string
}
export interface AudioConfigStartMessage extends WebSocketMessage {
  type: "websocket_audio_config_start";
  inputAudioConfig: InputAudioConfig;
  outputAudioConfig: OutputAudioConfig;
  conversationId?: string;
  subscribeTranscript?: boolean;
  conversationData?: ConversationData
}

export interface AudioMessage extends WebSocketMessage {
  type: "websocket_audio";
  data: string;
}

export interface TranscriptMessage extends WebSocketMessage {
  type: "websocket_transcript";
  text: string;
  sender: string;
  timestamp: string;
}

export interface ReadyMessage extends WebSocketMessage {
  type: "websocket_ready";
}

export interface StopMessage extends WebSocketMessage {
  type: "websocket_stop";
}

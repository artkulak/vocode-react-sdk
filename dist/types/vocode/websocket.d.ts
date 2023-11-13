import type { TranscriberConfig } from "./transcriber";
import type { AgentConfig } from "./agent";
import type { SynthesizerConfig } from "./synthesizer";
import { AudioEncoding } from "./audioEncoding";
export type WebSocketMessageType = "websocket_start" | "websocket_audio" | "websocket_transcript" | "websocket_ready" | "websocket_stop" | "websocket_audio_config_start";
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
    user_id?: any;
    user_first_name?: any;
    user_last_name?: any;
    user_interests?: any;
    deeva_profile_id?: any;
    deeva_memories?: any;
    deeva_name?: any;
    deeva_relationship_type?: any;
    deeva_interests?: any;
    deeva_voice_name?: any;
    partner_should_be?: any;
};
export interface AudioConfigStartMessage extends WebSocketMessage {
    type: "websocket_audio_config_start";
    inputAudioConfig: InputAudioConfig;
    outputAudioConfig: OutputAudioConfig;
    conversationId?: string;
    subscribeTranscript?: boolean;
    conversationData?: ConversationData;
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

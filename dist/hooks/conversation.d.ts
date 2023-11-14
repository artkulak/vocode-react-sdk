import { ConversationConfig, ConversationStatus, CurrentSpeaker, SelfHostedConversationConfig, Transcript } from "../types/conversation";
import { ConversationData } from "../types/vocode/websocket";
export declare const useConversation: (config: ConversationConfig | SelfHostedConversationConfig, conversationData: ConversationData) => {
    status: ConversationStatus;
    start: () => void;
    stop: () => void;
    error: Error | undefined;
    active: boolean;
    setActive: (active: boolean) => void;
    toggleActive: () => void;
    analyserNode: AnalyserNode | undefined;
    transcripts: Transcript[];
    currentSpeaker: CurrentSpeaker;
    muteMic: (mute: boolean) => void;
    muteSound: (mute: boolean) => void;
    isMicConnected: boolean;
};

import { ConversationConfig, ConversationStatus, CurrentSpeaker, SelfHostedConversationConfig, Transcript } from "../types/conversation";
export declare const useConversation: (config: ConversationConfig | SelfHostedConversationConfig) => {
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
};

import {
  IMediaRecorder,
  MediaRecorder,
  register,
} from "extendable-media-recorder";
import { connect } from "extendable-media-recorder-wav-encoder";
import React from "react";
import {
  ConversationConfig,
  ConversationStatus,
  CurrentSpeaker,
  SelfHostedConversationConfig,
  Transcript,
} from "../types/conversation";
import { blobToBase64, stringify } from "../utils";
import { AudioEncoding } from "../types/vocode/audioEncoding";
import {
  AudioConfigStartMessage,
  AudioMessage,
  StartMessage,
  StopMessage,
  ConversationData
} from "../types/vocode/websocket";
import { DeepgramTranscriberConfig, TranscriberConfig } from "../types";
import { isSafari, isChrome } from "react-device-detect";
import { Buffer } from "buffer";

import RecordRTC, { StereoAudioRecorder } from 'recordrtc'

const VOCODE_API_URL = "api.vocode.dev";
const DEFAULT_CHUNK_SIZE = 2048;
const DEFAULT_ANDROID_SAMPLE_RATE = 44000;

console.log('Voice SDK started.')

export const useConversation = (
  config: ConversationConfig | SelfHostedConversationConfig,
  conversationData: ConversationData
): {
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
} => {
  const [audioContext, setAudioContext] = React.useState<AudioContext>();
  const [audioAnalyser, setAudioAnalyser] = React.useState<AnalyserNode>();
  const [audioQueue, setAudioQueue] = React.useState<Buffer[]>([]);
  const [currentSpeaker, setCurrentSpeaker] =
    React.useState<CurrentSpeaker>("none");
  const [processing, setProcessing] = React.useState(false);
  const [recorder, setRecorder] = React.useState(); //TODO: remove for Media Recorder React.useState<IMediaRecorder>();
  const [audioStreamRef, setAudioStreamRef] = React.useState();
  const [isSoundsMuted, setIsSoundMuted] = React.useState(false);
  const [socket, setSocket] = React.useState<WebSocket>();
  const socketRef = React.useRef<WebSocket | null>(null);
  const [status, setStatus] = React.useState<ConversationStatus>("idle");
  const [error, setError] = React.useState<Error>();
  const [transcripts, setTranscripts] = React.useState<Transcript[]>([]);
  const [active, setActive] = React.useState(true);
  const [websocketRetries, setWebsocketRetries] = React.useState(0);
  const [isMicConnected, setIsMicConnected] = React.useState(false);

  const MAX_RETRIES = 2;
  const toggleActive = () => setActive(!active);

  // get audio context and metadata about user audio
  React.useEffect(() => {
    const audioContext = new AudioContext();
    setAudioContext(audioContext);
    const audioAnalyser = audioContext.createAnalyser();
    setAudioAnalyser(audioAnalyser);
  }, []);

  // when socket state changes
  React.useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const recordingDataListener = (data) => { // TODO: { data }: { data: Blob }
    // var a = document.createElement("a");
    // document.body.appendChild(a);
    // // a.style = "display: none";
    // a.href = window.URL.createObjectURL(data);
    // a.download = "test.wav";
    // a.click();
    blobToBase64(data).then((base64Encoded: string | null) => {
      if (!base64Encoded) return;
      const audioMessage: AudioMessage = {
        type: "websocket_audio",
        data: base64Encoded,
      };
      const currentSocket = socketRef.current;
      currentSocket?.readyState === WebSocket.OPEN &&
        currentSocket.send(stringify(audioMessage));
    });
  };

  // once the conversation is connected, stream the microphone audio into the socket
  React.useEffect(() => {
    if (!recorder || !socket) return;
    if (status === "connected") {
      // if (active)
      //   recorder.addEventListener("dataavailable", recordingDataListener);
      // else
      //   recorder.removeEventListener("dataavailable", recordingDataListener);
    }
  }, [recorder, socket, status, active]);

  // accept wav audio from webpage
  React.useEffect(() => {
    const registerWav = async () => {
      await register(await connect());
    };
    registerWav().catch(console.error);
  }, []);

  // play audio that is queued
  React.useEffect(() => {
    const playArrayBuffer = (arrayBuffer: ArrayBuffer) => {
      audioContext &&
        audioAnalyser &&
        audioContext.decodeAudioData(arrayBuffer, (buffer) => {
          const source = audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(audioContext.destination);
          source.connect(audioAnalyser);
          setCurrentSpeaker("agent");
          source.start(0);
          source.onended = () => {
            if (audioQueue.length <= 0) {
              setCurrentSpeaker("user");
            }
            setProcessing(false);
          };
        });
    };
    if (!processing && audioQueue.length > 0) {
      setProcessing(true);
      const audio = audioQueue.shift();
      if (!isSoundsMuted)
        audio &&
          fetch(URL.createObjectURL(new Blob([audio])))
            .then((response) => response.arrayBuffer())
            .then(playArrayBuffer);
      else setProcessing(false);
    }
  }, [audioQueue, processing]);

  let audioStream;
  const stopConversation = (error?: Error) => {
    setAudioQueue([]);
    setCurrentSpeaker("none");
    if (error) {
      setError(error);
      setStatus("error");
    } else {
      setStatus("idle");
    }
    console.log('Stopping conversation', recorder)
    if (!recorder || !socket) return;
    // recorder.stop(); TODO: return for MediaRecorder
    recorder.stopRecording();
    audioStreamRef.stop();
    const stopMessage: StopMessage = {
      type: "websocket_stop",
    };
    socket.send(stringify(stopMessage));
    socket.close();
    setRecorder(null);
  };

  const getBackendUrl = async () => {
    if ("backendUrl" in config) {
      return config.backendUrl;
    } else if ("vocodeConfig" in config) {
      const baseUrl = config.vocodeConfig.baseUrl || VOCODE_API_URL;
      return `wss://${baseUrl}/conversation?key=${config.vocodeConfig.apiKey}`;
    } else {
      throw new Error("Invalid config");
    }
  };

  const getStartMessage = (
    config: ConversationConfig,
    inputAudioMetadata: { samplingRate: number; audioEncoding: AudioEncoding },
    outputAudioMetadata: { samplingRate: number; audioEncoding: AudioEncoding }
  ): StartMessage => {
    let transcriberConfig: TranscriberConfig = Object.assign(
      config.transcriberConfig,
      inputAudioMetadata
    );
    if (isSafari && transcriberConfig.type === "transcriber_deepgram") {
      (transcriberConfig as DeepgramTranscriberConfig).downsampling = 2;
    }

    return {
      type: "websocket_start",
      transcriberConfig: Object.assign(
        config.transcriberConfig,
        inputAudioMetadata
      ),
      agentConfig: config.agentConfig,
      synthesizerConfig: Object.assign(
        config.synthesizerConfig,
        outputAudioMetadata
      ),
      conversationId: config.vocodeConfig.conversationId,
    };
  };

  const getAudioConfigStartMessage = (
    inputAudioMetadata: { samplingRate: number; audioEncoding: AudioEncoding },
    outputAudioMetadata: { samplingRate: number; audioEncoding: AudioEncoding },
    chunkSize: number | undefined,
    downsampling: number | undefined,
    conversationId: string | undefined,
    subscribeTranscript: boolean | undefined,
    conversationData: ConversationData,
  ): AudioConfigStartMessage => ({
    type: "websocket_audio_config_start",
    inputAudioConfig: {
      samplingRate: inputAudioMetadata.samplingRate,
      audioEncoding: inputAudioMetadata.audioEncoding,
      chunkSize: chunkSize || DEFAULT_CHUNK_SIZE,
      downsampling,
    },
    outputAudioConfig: {
      samplingRate: outputAudioMetadata.samplingRate,
      audioEncoding: outputAudioMetadata.audioEncoding,
    },
    conversationId,
    subscribeTranscript,
    conversationData
  });

  const startConversation = async () => {
    if (!audioContext || !audioAnalyser) return;
    setStatus("connecting");

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const backendUrl = await getBackendUrl();

    setError(undefined);
    const socket = new WebSocket(backendUrl);
    let error: Error | undefined;
    socket.onerror = (event) => {
      console.error(event);
      error = new Error("See console for error details");
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "websocket_audio") {
        setAudioQueue((prev) => [...prev, Buffer.from(message.data, "base64")]);
      } else if (message.type === "websocket_ready") {
        setStatus("connected");
      } else if (message.type == "websocket_transcript") {
        setTranscripts((prev) => {
          let last = prev.pop();
          console.log('SENDER', message.sender)
          if (message.sender == 'bot') {
            if (last) {
              prev.push(last);
            }
            prev.push({
              sender: message.sender,
              text: message.text,
            });
          }
          // if (last && last.sender === message.sender) {
          //   prev.push({
          //     sender: message.sender,
          //     text: last.text + " " + message.text,
          //   });
          // } else {
          //   if (last) {
          //     prev.push(last);
          //   }
          //   prev.push({
          //     sender: message.sender,
          //     text: message.text,
          //   });
          // }
          return prev;
        });
      }
    };
    socket.onclose = () => {
      // console.log('Socket closed, attempting to reconnect..')
      // if (websocketRetries < MAX_RETRIES) {
      //   console.log('WebSocket connection closed, retrying...', event);
      //   setTimeout(() => {
      //     console.log('Retrying WebSocket connection...');
      //     startConversation();  // make sure this handles re-establishing the websocket connection
      //     setWebsocketRetries(websocketRetries + 1);
      //   }, 1000); // delay in ms before attempting to reconnect
      // } else {
      //   console.log('WebSocket connection closed', event);
      //   stopConversation(); // Stop the conversation if max retries have been exceeded
      // }
      console.log('Websocket connection closed!')
      stopConversation(error);
    };

    // wait for socket to be ready
    await new Promise((resolve) => {
      const interval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    });
    setSocket(socket);


    try {
      const trackConstraints: MediaTrackConstraints = {
        echoCancellation: true,
      };
      if (config.audioDeviceConfig.inputDeviceId) {
        console.log(
          "Using input device",
          config.audioDeviceConfig.inputDeviceId
        );
        trackConstraints.deviceId = config.audioDeviceConfig.inputDeviceId;
      }
      audioStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        //audio: true
        audio: trackConstraints,
      });
      setIsMicConnected(true);
      setAudioStreamRef(audioStream);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        alert(
          "Allowlist this site at chrome://settings/content/microphone to talk to the bot."
        );
        error = new Error("Microphone access denied");
      }
      console.error(error);
      setIsMicConnected(false);
      stopConversation(error as Error);
      return;
    }
    const micSettings = audioStream.getAudioTracks()[0].getSettings();
    console.log(micSettings);
    const defaultMicSampleRate = micSettings.sampleRate || audioContext.sampleRate;
    // fix for android devices
    let micSampleRate = defaultMicSampleRate < 22050 ? DEFAULT_ANDROID_SAMPLE_RATE : defaultMicSampleRate; // webrtc min rate
    micSampleRate = micSampleRate > 96000 ? DEFAULT_ANDROID_SAMPLE_RATE : micSampleRate; // web rtc max rate

    const inputAudioMetadata = {
      samplingRate: micSampleRate,
      audioEncoding: "linear16" as AudioEncoding,
    };
    console.log("Input audio metadata", inputAudioMetadata);

    const outputAudioMetadata = {
      samplingRate:
        config.audioDeviceConfig.outputSamplingRate || audioContext.sampleRate,
      audioEncoding: "linear16" as AudioEncoding,
    };
    console.log("Output audio metadata", inputAudioMetadata);

    let startMessage;
    if (
      [
        "transcriberConfig",
        "agentConfig",
        "synthesizerConfig",
        "vocodeConfig",
      ].every((key) => key in config)
    ) {
      startMessage = getStartMessage(
        config as ConversationConfig,
        inputAudioMetadata,
        outputAudioMetadata
      );
    } else {
      const selfHostedConversationConfig =
        config as SelfHostedConversationConfig;
      startMessage = getAudioConfigStartMessage(
        inputAudioMetadata,
        outputAudioMetadata,
        selfHostedConversationConfig.chunkSize,
        selfHostedConversationConfig.downsampling,
        selfHostedConversationConfig.conversationId,
        selfHostedConversationConfig.subscribeTranscript,
        conversationData
      );
    }

    socket.send(stringify(startMessage));
    console.log("Access to microphone granted");

    let timeSlice;
    if ("transcriberConfig" in startMessage) {
      timeSlice = Math.round(
        (1000 * startMessage.transcriberConfig.chunkSize) /
        startMessage.transcriberConfig.samplingRate
      );
    } else if ("timeSlice" in config) {
      timeSlice = config.timeSlice;
    } else {
      timeSlice = 10;
    }

    let recorderToUse = recorder;
    if (recorderToUse && recorderToUse.state === "paused") {
      // recorderToUse.resume(); TODO: return for media recorder
      recorderToUse.resumeRecording()
    } else if (!recorderToUse) {
      // if (isSafari) {
      //   console.log('Using video/mp4 mime type')
      //   recorderToUse = new MediaRecorder(audioStream, {
      //     mimeType: "audio/wav" //"audio/ogg" //"video/mp4",
      //   });
      // }
      // else {
      //   console.log('Using audio/wav mime type')
      //   recorderToUse = new MediaRecorder(audioStream, {
      //     mimeType: "audio/wav",
      //   });
      // }

      // once the conversation is connected, stream the microphone audio into the socket
      var isMimeTypeSupported = (_mimeType) => {
        // if (webrtcDetectedBrowser === 'edge')  return false;

        if (typeof MediaRecorder.isTypeSupported !== 'function') {
          return true;
        }

        return MediaRecorder.isTypeSupported(_mimeType);
      };

      var mimeType = 'audio/mpeg';
      var recorderType = StereoAudioRecorder;

      if (isMimeTypeSupported(mimeType) === false) {
        console.log(mimeType, 'is not supported.');
        mimeType = 'audio/ogg';

        if (isMimeTypeSupported(mimeType) === false) {
          console.log(mimeType, 'is not supported.');
          mimeType = 'audio/webm';

          if (isMimeTypeSupported(mimeType) === false) {
            console.log(mimeType, 'is not supported.');

            // fallback to WebAudio solution
            mimeType = 'audio/wav';
            recorderType = StereoAudioRecorder;
          }
        }
      }
      const defaultWebrtcSampleRate = micSettings.sampleRate || audioContext.sampleRate;
      // fix for android devices
      let webrtcMicSampleRate = defaultWebrtcSampleRate < 22050 ? DEFAULT_ANDROID_SAMPLE_RATE : defaultWebrtcSampleRate; // webrtc min rate
      webrtcMicSampleRate = webrtcMicSampleRate > 96000 ? DEFAULT_ANDROID_SAMPLE_RATE : webrtcMicSampleRate; // web rtc max rate
      if (isSafari) console.log('Safari browser detected!')
      if (isSafari)
        recorderToUse = RecordRTC(audioStream, {
          type: 'audio',
          // mimeType: mimeType, //'audio/wav',
          sampleRate: webrtcMicSampleRate,
          recorderType: StereoAudioRecorder,
          numberOfAudioChannels: 1,
          timeSlice: timeSlice,
          // desiredSampRate: micSettings.sampleRate,
          // bufferSize: DEFAULT_CHUNK_SIZE,
          // getNativeBlob: true,
          ondataavailable: recordingDataListener
        });
      else
        recorderToUse = RecordRTC(audioStream, {
          type: 'audio',
          //mimeType: mimeType,
          sampleRate: webrtcMicSampleRate,
          recorderType: StereoAudioRecorder,
          numberOfAudioChannels: 1,
          timeSlice: timeSlice,
          // desiredSampRate: micSettings.sampleRate,
          // bufferSize: DEFAULT_CHUNK_SIZE,
          // getNativeBlob: true,
          ondataavailable: recordingDataListener
        });
      setRecorder(recorderToUse);

      // if (isSafari) {
      //   console.log('Using recordrtc Safari', timeSlice)
      //   recorderToUse = RecordRTC(audioStream, {
      //     type: 'audio',
      //     mimeType: 'audio/wav',
      //     sampleRate: micSettings.sampleRate,
      //     recorderType: StereoAudioRecorder,
      //     numberOfAudioChannels: 1,
      //     timeSlice: timeSlice,
      //     desiredSampRate: 16000,
      //     //bufferSize: DEFAULT_CHUNK_SIZE,
      //     getNativeBlob: true,
      //     ondataavailable: recordingDataListener
      //   })
      // } else {
      //   console.log('Using recordrtc Other', timeSlice)
      //   recorderToUse = RecordRTC(audioStream, {
      //     type: 'audio',
      //     mimeType: 'audio/wav',
      //     sampleRate: micSettings.sampleRate,
      //     recorderType: StereoAudioRecorder,
      //     numberOfAudioChannels: 1,
      //     timeSlice: timeSlice,
      //     desiredSampRate: 16000,
      //     //bufferSize: DEFAULT_CHUNK_SIZE,
      //     getNativeBlob: true,
      //     ondataavailable: recordingDataListener
      //   })
      // }
      // setRecorder(recorderToUse);
    }



    if (recorderToUse.state === "recording") {
      // When the recorder is in the recording state, see:
      // https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/state
      // which is not expected to call `start()` according to:
      // https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start.
      return;
    }
    // recorderToUse.start(timeSlice); TODO: return for MediaRecorder
    recorderToUse.startRecording();
  };


  // mute microphone 
  const muteMic = React.useCallback(async (mute: boolean) => {
    if (audioStreamRef && audioStreamRef.getAudioTracks().length > 0) {
      if (mute)
        audioStreamRef.getAudioTracks()[0].enabled = false;
      else
        audioStreamRef.getAudioTracks()[0].enabled = true;
    }
  }, [audioStreamRef]);


  // mute sound 
  const muteSound = React.useCallback(async (mute: boolean) => {
    if (mute)
      setIsSoundMuted(true);
    else
      setIsSoundMuted(false);
  }, [isSoundsMuted]);

  return {
    status,
    start: startConversation,
    stop: stopConversation,
    error,
    toggleActive,
    active,
    setActive,
    analyserNode: audioAnalyser,
    transcripts,
    currentSpeaker,
    muteMic,
    muteSound,
    isMicConnected
  };
};

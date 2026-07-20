type VideoCodecChoice = 'h264' | 'h265' | 'vp9' | 'av1';

type VideoSettings = {
    startFrame: number;
    endFrame: number;
    frameRate: number;
    width: number;
    height: number;
    bitrate: number;
    transparentBg: boolean;
    showDebug: boolean;
    format: 'mp4' | 'webm' | 'mov' | 'mkv';
    codec: VideoCodecChoice;
    projection?: 'standard' | 'equirect';
    levelHorizon?: boolean;
};

type MuxerVideoCodec = 'avc' | 'hevc' | 'vp9' | 'av1';

const CODEC_CONFIG: Record<VideoCodecChoice, { type: MuxerVideoCodec; codec: (height: number) => string }> = {
    h264: { type: 'avc', codec: h => (h < 1080 ? 'avc1.420028' : 'avc1.640033') }, // H.264 Constrained Baseline/High profile
    h265: { type: 'hevc', codec: () => 'hev1.1.6.L120.B0' },                       // H.265 Main profile, Level 4.0
    vp9: { type: 'vp9', codec: () => 'vp09.00.10.08' },                            // VP9 Profile 0, Level 1.0
    av1: { type: 'av1', codec: () => 'av01.0.05M.08' }                             // AV1 Main Profile, Level 3.1
};

const getVideoCodecType = (codecChoice: VideoCodecChoice): MuxerVideoCodec => {
    return CODEC_CONFIG[codecChoice]?.type ?? CODEC_CONFIG.h264.type;
};

const buildVideoEncoderConfig = (
    settings: Pick<VideoSettings, 'codec' | 'width' | 'height' | 'bitrate' | 'frameRate'>
) => {
    const { codec: codecChoice, width, height, bitrate, frameRate } = settings;
    const codecConfig = CODEC_CONFIG[codecChoice] ?? CODEC_CONFIG.h264;

    return {
        codec: codecConfig.codec(height),
        width,
        height,
        bitrate,
        framerate: frameRate,
        bitrateMode: 'variable' as const
    };
};

export { buildVideoEncoderConfig, getVideoCodecType };
export type { VideoCodecChoice, VideoSettings };

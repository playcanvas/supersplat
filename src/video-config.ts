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

type EncoderParams = {
    width: number;
    height: number;
    frameRate: number;
};

// Each codec string declares a level, and levels cap the frame size and
// pixel rate a stream may carry. Declaring a level too low for the requested
// dimensions makes VideoEncoder.isConfigSupported() reject configurations the
// hardware could otherwise encode (notably 8K), so pick the smallest level
// from the spec tables that covers the requested resolution and frame rate.

// h.264: [level_idc, max frame size in 16x16 macroblocks, max macroblocks/s]
// (Rec. ITU-T H.264 Table A-1)
const H264_LEVELS: [number, number, number][] = [
    [40, 8192, 245760],
    [42, 8704, 522240],
    [50, 22080, 589824],
    [51, 36864, 983040],
    [52, 36864, 2073600],
    [60, 139264, 4177920],
    [61, 139264, 8355840],
    [62, 139264, 16711680]
];

// h.265: [level_idc, max luma picture size, max luma samples/s]
// (Rec. ITU-T H.265 Table A.8)
const HEVC_LEVELS: [number, number, number][] = [
    [120, 2228224, 66846720],
    [123, 2228224, 133693440],
    [150, 8912896, 267386880],
    [153, 8912896, 534773760],
    [156, 8912896, 1069547520],
    [180, 35651584, 1069547520],
    [183, 35651584, 2139095040],
    [186, 35651584, 4278190080]
];

// vp9: [level, max luma picture size, max luma samples/s]
// (VP9 Bitstream & Decoding Process Specification, Annex A)
const VP9_LEVELS: [number, number, number][] = [
    [10, 36864, 829440],
    [11, 73728, 2764800],
    [20, 122880, 4608000],
    [21, 245760, 9216000],
    [30, 552960, 20736000],
    [31, 983040, 36864000],
    [40, 2228224, 83558400],
    [41, 2228224, 160432128],
    [50, 8912896, 311951360],
    [51, 8912896, 588251136],
    [52, 8912896, 1176502272],
    [60, 35651584, 1176502272],
    [61, 35651584, 2353004544],
    [62, 35651584, 4706009088]
];

// av1: [seq_level_idx, max picture size, max display rate, max width, max height]
// (AV1 Bitstream & Decoding Process Specification, Annex A); starts at level
// 3.1, the historical floor
const AV1_LEVELS: [number, number, number, number, number][] = [
    [5, 1065024, 31950720, 5504, 3096],
    [8, 2359296, 70778880, 6144, 3456],
    [9, 2359296, 141557760, 6144, 3456],
    [12, 8912896, 267386880, 8192, 4352],
    [13, 8912896, 534773760, 8192, 4352],
    [14, 8912896, 1069547520, 8192, 4352],
    [16, 35651584, 1069547520, 16384, 8704],
    [17, 35651584, 2139095040, 16384, 8704],
    [18, 35651584, 4278190080, 16384, 8704]
];

const h264Codec = ({ width, height, frameRate }: EncoderParams) => {
    const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
    // constrained baseline profile level 4.0 for sub-1080 frames, high
    // profile level 5.1 otherwise; raise the level only when the frame size
    // or macroblock rate demands it
    const [profile, minLevel] = height < 1080 ? ['4200', 40] : ['6400', 51];
    const level = H264_LEVELS.find(([idc, maxFs, maxRate]) => idc >= minLevel && macroblocks <= maxFs && macroblocks * frameRate <= maxRate)?.[0] ?? 62;
    return `avc1.${profile}${level.toString(16).padStart(2, '0')}`;
};

// h.265 main profile, main tier
const h265Codec = ({ width, height, frameRate }: EncoderParams) => {
    const samples = width * height;
    const level = HEVC_LEVELS.find(([, maxPs, maxSr]) => samples <= maxPs && samples * frameRate <= maxSr)?.[0] ?? 186;
    return `hev1.1.6.L${level}.B0`;
};

// vp9 profile 0, 8-bit
const vp9Codec = ({ width, height, frameRate }: EncoderParams) => {
    const samples = width * height;
    const level = VP9_LEVELS.find(([, maxPs, maxSr]) => samples <= maxPs && samples * frameRate <= maxSr)?.[0] ?? 62;
    return `vp09.00.${level}.08`;
};

// av1 main profile, main tier, 8-bit
const av1Codec = ({ width, height, frameRate }: EncoderParams) => {
    const samples = width * height;
    const levelIdx = AV1_LEVELS.find(([, maxPs, maxRate, maxWidth, maxHeight]) => samples <= maxPs && samples * frameRate <= maxRate && width <= maxWidth && height <= maxHeight)?.[0] ?? 18;
    return `av01.0.${String(levelIdx).padStart(2, '0')}M.08`;
};

const CODEC_CONFIG: Record<VideoCodecChoice, { type: MuxerVideoCodec; codec: (params: EncoderParams) => string }> = {
    h264: { type: 'avc', codec: h264Codec },
    h265: { type: 'hevc', codec: h265Codec },
    vp9: { type: 'vp9', codec: vp9Codec },
    av1: { type: 'av1', codec: av1Codec }
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
        codec: codecConfig.codec({ width, height, frameRate }),
        width,
        height,
        bitrate,
        framerate: frameRate,
        bitrateMode: 'variable' as const
    };
};

export { buildVideoEncoderConfig, getVideoCodecType };
export type { VideoCodecChoice, VideoSettings };

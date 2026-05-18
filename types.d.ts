/* eslint-disable no-unused-vars */
interface Window {
    sse: {
        poster?: HTMLImageElement,
        settings: Promise<object>,
        contentUrl: string,
        contents: ArrayBuffer,
        params: Record<string, string>
    }

    firstFrame?: () => void;

    scrubTo?: (time: number) => Promise<void>;

    animationDuration?: number;

    getCameraState?: () => {
        position: [number, number, number];
        angles: [number, number, number];
        distance: number;
        fov: number;
        mode: 'orbit' | 'anim' | 'fly' | 'walk';
    };

    setCameraState?: (snapshot: {
        position: [number, number, number];
        angles: [number, number, number];
        distance: number;
        fov: number;
        mode: 'orbit' | 'anim' | 'fly' | 'walk';
    }) => void;
}

declare module 'playcanvas/scripts/esm/xr-controllers.mjs' {
    const XrControllers: any;
    export { XrControllers };
}

declare module 'playcanvas/scripts/esm/xr-navigation.mjs' {
    const XrNavigation: any;
    export { XrNavigation };
}

declare module '*.html' {
    const content: string;
    export default content;
}

declare module '*.css' {
    const content: string;
    export default content;
}

declare module '*.js' {
    const content: string;
    export default content;
}

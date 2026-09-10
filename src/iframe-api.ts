import { Events } from './events';

const IS_SCENE_DIRTY = 'supersplat:is-scene-dirty';
const NAVIGATE_HOME = 'supersplat:navigate-home';

interface IsSceneDirtyQuery {
    type: typeof IS_SCENE_DIRTY;
}

interface IsSceneDirtyResponse {
    type: typeof IS_SCENE_DIRTY;
    result: boolean;
}

const isSceneDirtyQuery = (data: any): data is IsSceneDirtyQuery => {
    return (
        data &&
        typeof data === 'object' &&
        data.type === IS_SCENE_DIRTY
    );
};

const registerIframeApi = (events: Events) => {
    window.addEventListener('message', (event: MessageEvent) => {
        const source = event.source as Window | null;
        if (!source) {
            return;
        }

        if (isSceneDirtyQuery(event.data)) {
            const response: IsSceneDirtyResponse = {
                type: IS_SCENE_DIRTY,
                result: events.invoke('scene.dirty') as boolean
            };
            source.postMessage(response, event.origin);
        }
    });
};

interface NavigateHomeRequest {
    type: typeof NAVIGATE_HOME;
}

const isEmbedded = () => window.parent !== window;

// The embedding page's origin: the referrer when the browser sends one, else
// our own origin (superspl.at serves the editor from the same host). Never '*'.
const hostOrigin = () => {
    try {
        return document.referrer ? new URL(document.referrer).origin : window.location.origin;
    } catch {
        return window.location.origin;
    }
};

// The menubar logo. Embedded (superspl.at/editor), the host decides how to
// leave — it owns navigation, the unsaved-changes guard and any transition.
// Standalone, go to the SuperSplat site directly.
const requestNavigateHome = () => {
    if (isEmbedded()) {
        const request: NavigateHomeRequest = { type: NAVIGATE_HOME };
        window.parent.postMessage(request, hostOrigin());
        return;
    }
    window.location.assign('https://superspl.at/');
};

export { registerIframeApi, requestNavigateHome };

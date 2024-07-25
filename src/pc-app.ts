import {
    // platform,
    WebglGraphicsDevice,
    // SoundManager,
    // Lightmapper,
    // BatchManager,
    AppBase,
    AppOptions,
    // script,
    // AnimationComponentSystem,
    AnimComponentSystem,
    // AudioListenerComponentSystem,
    // AudioSourceComponentSystem,
    // ButtonComponentSystem,
    // CollisionComponentSystem,
    // ElementComponentSystem,
    // JointComponentSystem,
    // LayoutChildComponentSystem,
    // LayoutGroupComponentSystem,
    // ModelComponentSystem,
    // ParticleSystemComponentSystem,
    RenderComponentSystem,
    // RigidBodyComponentSystem,
    // ScreenComponentSystem,
    // ScriptLegacyComponentSystem,
    // ScrollViewComponentSystem,
    // ScrollbarComponentSystem,
    // SoundComponentSystem,
    // SpriteComponentSystem,
    // ZoneComponentSystem,
    CameraComponentSystem,
    LightComponentSystem,
    GSplatComponentSystem,
    // ScriptComponentSystem,
    RenderHandler,
    // AnimationHandler,
    AnimClipHandler,
    AnimStateGraphHandler,
    // AudioHandler,
    // BinaryHandler,
    ContainerHandler,
    // CssHandler,
    CubemapHandler,
    // FolderHandler,
    // FontHandler,
    GSplatHandler,
    // HierarchyHandler,
    // HtmlHandler,
    // JsonHandler,
    // MaterialHandler,
    // ModelHandler,
    // SceneHandler,
    // ScriptHandler,
    // ShaderHandler,
    // SpriteHandler,
    // TemplateHandler,
    // TextHandler,
    // TextureAtlasHandler,
    TextureHandler,
    // XrManager
} from 'playcanvas';

class PCApp extends AppBase {
    constructor(canvas: HTMLCanvasElement, options: any) {
        super(canvas);

        const appOptions = new AppOptions();

        appOptions.graphicsDevice = options.graphicsDevice;
        this.addComponentSystems(appOptions);
        this.addResourceHandles(appOptions);

        appOptions.elementInput = options.elementInput;
        appOptions.keyboard = options.keyboard;
        appOptions.mouse = options.mouse;
        appOptions.touch = options.touch;
        appOptions.gamepads = options.gamepads;

        appOptions.scriptPrefix = options.scriptPrefix;
        appOptions.assetPrefix = options.assetPrefix;
        appOptions.scriptsOrder = options.scriptsOrder;

        // appOptions.soundManager = new SoundManager(options);
        // @ts-ignore
        // appOptions.lightmapper = Lightmapper;
        // appOptions.batchManager = BatchManager;
        // @ts-ignore
        // appOptions.xr = XrManager;

        this.init(appOptions);
    }

    addComponentSystems(appOptions: AppOptions) {
        appOptions.componentSystems = [
            // RigidBodyComponentSystem,
            // CollisionComponentSystem,
            // JointComponentSystem,
            // AnimationComponentSystem,
            // @ts-ignore
            AnimComponentSystem,
            // ModelComponentSystem,
            // @ts-ignore
            RenderComponentSystem,
            // @ts-ignore
            CameraComponentSystem,
            // @ts-ignore
            LightComponentSystem,
            // script.legacy ? ScriptLegacyComponentSystem : ScriptComponentSystem,
            // AudioSourceComponentSystem,
            // SoundComponentSystem,
            // AudioListenerComponentSystem,
            // ParticleSystemComponentSystem,
            // ScreenComponentSystem,
            // ElementComponentSystem,
            // ButtonComponentSystem,
            // ScrollViewComponentSystem,
            // ScrollbarComponentSystem,
            // SpriteComponentSystem,
            // LayoutGroupComponentSystem,
            // LayoutChildComponentSystem,
            // ZoneComponentSystem,
            GSplatComponentSystem
        ];
    }

    addResourceHandles(appOptions: AppOptions) {
        appOptions.resourceHandlers = [
            // @ts-ignore
            RenderHandler,
            // AnimationHandler,
            // @ts-ignore
            AnimClipHandler,
            // @ts-ignore
            AnimStateGraphHandler,
            // ModelHandler,
            // MaterialHandler,
            // @ts-ignore
            TextureHandler,
            // TextHandler,
            // JsonHandler,
            // AudioHandler,
            // ScriptHandler,
            // SceneHandler,
            // @ts-ignore
            CubemapHandler,
            // HtmlHandler,
            // CssHandler,
            // ShaderHandler,
            // HierarchyHandler,
            // FolderHandler,
            // FontHandler,
            // BinaryHandler,
            // TextureAtlasHandler,
            // SpriteHandler,
            // TemplateHandler,
            // @ts-ignore
            ContainerHandler,
            GSplatHandler
        ];
    }
}

export {PCApp};

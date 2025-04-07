const myxConfig = {
    enabled: true,
    showGrid: () => { return false || !myxConfig.enabled },
    showScenePanel:  () => { return true || !myxConfig.enabled },
    showMenu:  () => { return false || !myxConfig.enabled },
    showBottomToolbar:  () => { return false || !myxConfig.enabled },
    showRightToolbar:  () => { return false || !myxConfig.enabled },
    showModeToggle:  () => { return true || !myxConfig.enabled },
    showDataPanel:  () => { return true || !myxConfig.enabled },
    showViewCube: () => { return true || !myxConfig.enabled },
    showTimelinePanel: () => { return false || !myxConfig.enabled },
    showMyxPanel: () => { return true || !myxConfig.enabled },
    scene: {
        bulkLoad: {
            enabled: false,
            level: 1
        },
        cameraLoad: {
            enabled: false,
            l1Distance: 10,
            l2Distance: 5,
            l3Distance: 1
        }
    }
}

type MyxConfig = typeof myxConfig;

export { myxConfig, MyxConfig }
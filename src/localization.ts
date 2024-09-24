import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

export const localizeInit = () => {
    i18next
        .use(LanguageDetector)
        .init({
            fallbackLng: 'en',
            debug: true,
            resources: {
                en: {
                    translation: {
                        // Scene menu
                        "scene": "Scene",
                        "scene.new": "New",
                        "scene.open": "Open",
                        "scene.import": "Import",
                        "scene.load-all-ply-data": "Load all PLY data",
                        "scene.save": "Save",
                        "scene.save-as": "Save As...",
                        "scene.export": "Export",
                        "scene.export.compressed-ply": "Compressed Ply",
                        "scene.export.splat": "Splat file",

                        // Selection menu
                        "selection": "Selection",
                        "selection.all": "All",
                        "selection.none": "None",
                        "selection.invert": "Inverse",
                        "selection.lock": "Lock Selection",
                        "selection.unlock": "Unlock All",
                        "selection.delete": "Delete Selection",
                        "selection.reset": "Reset Splat",

                        // Help menu
                        "help": "Help",
                        "help.shortcuts": "Keyboard Shortcuts",
                        "help.user-guide": "User Guide",
                        "help.log-an-issue": "Log an Issue",
                        "help.github-repo": "GitHub Repo",
                        "help.discord": "Discord Server",
                        "help.forum": "Forum",
                        "help.about": "About SuperSplat",

                        // Modes
                        "mode.centers": "Centers Mode",
                        "mode.rings": "Rings Mode",

                        // Scene panel
                        "scene-manager": "SCENE MANAGER",
                        "transform": "TRANSFORM",
                        "position": "Position",
                        "rotation": "Rotation",
                        "scale": "Scale",

                        // Options panel
                        "options": "VIEW OPTIONS",
                        "options.fov": "Field of View",
                        "options.sh-bands": "SH Bands",
                        "options.centers-size": "Centers Size",
                        "options.show-grid": "Show Grid",
                        "options.show-bound": "Show Bound",

                        // Data panel
                        "data": "SPLAT DATA",
                        "data.distance": "Distance",
                        "data.volume": "Volume",
                        "data.surface-area": "Surface Area",
                        "data.scale-x": "Scale X",
                        "data.scale-y": "Scale Y",
                        "data.scale-z": "Scale Z",
                        "data.red": "Red",
                        "data.green": "Green",
                        "data.blue": "Blue",
                        "data.opacity": "Opacity",
                        "data.hue": "Hue",
                        "data.saturation": "Saturation",
                        "data.value": "Value",
                        "data.log-scale": "Log Scale",
                        "data.totals": "Totals",
                        "data.totals.splats": "Splats",
                        "data.totals.selected": "Selected",
                        "data.totals.hidden": "Hidden",
                        "data.totals.deleted": "Deleted",

                        // Popup
                        "popup.ok": "OK",
                        "popup.cancel": "Cancel",
                        "popup.yes": "Yes",
                        "popup.no": "No",
                        "popup.error-loading": "ERROR LOADING FILE",

                        // Right toolbar
                        "tooltip.splat-mode": "Splat Mode ( M )",
                        "tooltip.show-hide": "Show/Hide Splats ( Space )",
                        "tooltip.frame-selection": "Frame Selection ( F )",
                        "tooltip.view-options": "View Options",

                        // Bottom toolbar
                        "tooltip.undo": "Undo ( Ctrl + Z )",
                        "tooltip.redo": "Redo ( Ctrl + Shift + Z )",
                        "tooltip.picker": "Picker Select ( P )",
                        "tooltip.brush": "Brush Select ( B )",
                        "tooltip.sphere": "Sphere Select",
                        "tooltip.translate": "Translate ( 1 )",
                        "tooltip.rotate": "Rotate ( 2 )",
                        "tooltip.scale": "Scale ( 3 )",
                        "tooltip.local-space": "Local Space Gizmo"
                    }
                },
                ja: {
                    translation: {
                        // Scene menu
                        "scene": "シーン",
                        "scene.new": "新規作成",
                        "scene.open": "開く",
                        "scene.import": "インポート",
                        "scene.load-all-ply-data": "全ての PLY データを読み込む",
                        "scene.save": "保存",
                        "scene.save-as": "名前を付けて保存",
                        "scene.export": "エクスポート",
                        "scene.export.compressed-ply": "圧縮 Ply",
                        "scene.export.splat": "Splat ファイル",

                        // Selection menu
                        "selection": "選択",
                        "selection.all": "全て",
                        "selection.none": "なし",
                        "selection.invert": "反転",
                        "selection.lock": "選択をロック",
                        "selection.unlock": "全ての選択を解除",
                        "selection.delete": "選択を削除",
                        "selection.reset": "Splat をリセット",

                        // Help menu
                        "help": "ヘルプ",
                        "help.shortcuts": "キーボードショートカット",
                        "help.user-guide": "ユーザーガイド",
                        "help.log-an-issue": "問題を報告",
                        "help.github-repo": "GitHub リポジトリ",
                        "help.discord": "Discord サーバー",
                        "help.forum": "フォーラム",
                        "help.about": "SuperSplat について",

                        // Modes
                        "mode.centers": "センターモード",
                        "mode.rings": "リングモード",

                        // Scene panel
                        "scene-manager": "シーンマネージャ",
                        "transform": "変換",
                        "position": "位置",
                        "rotation": "回転",
                        "scale": "スケール",

                        // Options panel
                        "options": "表示オプション",
                        "options.fov": "視野角",
                        "options.sh-bands": "球面調和バンド",
                        "options.centers-size": "センターサイズ",
                        "options.show-grid": "グリッドを表示",
                        "options.show-bound": "バウンドを表示",

                        // Data panel
                        "data": "SPLAT データ",
                        "data.distance": "距離",
                        "data.volume": "体積",
                        "data.surface-area": "表面積",
                        "data.scale-x": "スケール X",
                        "data.scale-y": "スケール Y",
                        "data.scale-z": "スケール Z",
                        "data.red": "赤",
                        "data.green": "緑",
                        "data.blue": "青",
                        "data.opacity": "不透明度",
                        "data.hue": "色相",
                        "data.saturation": "彩度",
                        "data.value": "明度",
                        "data.log-scale": "対数スケール",
                        "data.totals": "合計",
                        "data.totals.splats": "スプラット",
                        "data.totals.selected": "選択",
                        "data.totals.hidden": "非表示",
                        "data.totals.deleted": "削除",

                        // Popup
                        "popup.ok": "OK",
                        "popup.cancel": "キャンセル",
                        "popup.yes": "はい",
                        "popup.no": "いいえ",
                        "popup.error-loading": "ファイルの読み込みエラー",

                        // Right toolbar
                        "tooltip.splat-mode": "スプラットモード ( M )",
                        "tooltip.show-hide": "スプラットの表示/非表示 ( Space )",
                        "tooltip.frame-selection": "選択をフレーム ( F )",
                        "tooltip.view-options": "表示オプション",

                        // Bottom toolbar
                        "tooltip.undo": "元に戻す ( Ctrl + Z )",
                        "tooltip.redo": "やり直し ( Ctrl + Shift + Z )",
                        "tooltip.picker": "ピッカー選択 ( P )",
                        "tooltip.brush": "ブラシ選択 ( B )",
                        "tooltip.sphere": "球選択",
                        "tooltip.translate": "移動 ( 1 )",
                        "tooltip.rotate": "回転 ( 2 )",
                        "tooltip.scale": "スケール ( 3 )",
                        "tooltip.local-space": "ローカルスペースギズモ"
                    }
                },
                zh: {
                    translation: {
                        // Scene menu
                        "scene": "场景",
                        "scene.new": "新建",
                        "scene.open": "打开",
                        "scene.import": "导入",
                        "scene.load-all-ply-data": "加载所有 PLY 数据",
                        "scene.save": "保存",
                        "scene.save-as": "另存为...",
                        "scene.export": "导出",
                        "scene.export.compressed-ply": "压缩 Ply",
                        "scene.export.splat": "Splat 文件",

                        // Selection menu
                        "selection": "选择",
                        "selection.all": "全部",
                        "selection.none": "无",
                        "selection.invert": "反选",
                        "selection.lock": "锁定选择",
                        "selection.unlock": "解锁全部",
                        "selection.delete": "删除选择",
                        "selection.reset": "重置 Splat",

                        // Help menu
                        "help": "帮助",
                        "help.shortcuts": "键盘快捷键",
                        "help.user-guide": "用户指南",
                        "help.log-an-issue": "报告问题",
                        "help.github-repo": "GitHub 仓库",
                        "help.discord": "Discord 服务器",
                        "help.forum": "论坛",
                        "help.about": "关于 SuperSplat",

                        // Modes
                        "mode.centers": "中心模式",
                        "mode.rings": "环模式",

                        // Scene panel
                        "scene-manager": "场景管理器",
                        "transform": "变换",
                        "position": "位置",
                        "rotation": "旋转",
                        "scale": "缩放",

                        // Options panel
                        "options": "视图选项",
                        "options.fov": "视野角",
                        "options.sh-bands": "SH 带",
                        "options.centers-size": "中心大小",
                        "options.show-grid": "显示网格",
                        "options.show-bound": "显示边界",

                        // Data panel
                        "data": "SPLAT 数据",
                        "data.distance": "距离",
                        "data.volume": "体积",
                        "data.surface-area": "表面积",
                        "data.scale-x": "缩放 X",
                        "data.scale-y": "缩放 Y",
                        "data.scale-z": "缩放 Z",
                        "data.red": "红",
                        "data.green": "绿",
                        "data.blue": "蓝",
                        "data.opacity": "不透明度",
                        "data.hue": "色相",
                        "data.saturation": "饱和度",
                        "data.value": "明度",
                        "data.log-scale": "对数缩放",
                        "data.totals": "总计",
                        "data.totals.splats": "Splat",
                        "data.totals.selected": "选择",
                        "data.totals.hidden": "隐藏",
                        "data.totals.deleted": "删除",
                        
                        // Popup
                        "popup.ok": "确定",
                        "popup.cancel": "取消",
                        "popup.yes": "是",
                        "popup.no": "否",
                        "popup.error-loading": "加载文件错误",

                        // Right toolbar
                        "tooltip.splat-mode": "Splat 模式 ( M )",
                        "tooltip.show-hide": "显示/隐藏 Splats ( Space )",
                        "tooltip.frame-selection": "框选 ( F )",
                        "tooltip.view-options": "视图选项",

                        // Bottom toolbar
                        "tooltip.undo": "撤销 ( Ctrl + Z )",
                        "tooltip.redo": "重做 ( Ctrl + Shift + Z )",
                        "tooltip.picker": "选择器 ( P )",
                        "tooltip.brush": "画笔 ( B )",
                        "tooltip.sphere": "球选择",
                        "tooltip.translate": "移动 ( 1 )",
                        "tooltip.rotate": "旋转 ( 2 )",
                        "tooltip.scale": "缩放 ( 3 )",
                        "tooltip.local-space": "局部坐标系"
                    }
                }
            },
            interpolation: {
                escapeValue: false
            }
        });
};

export const localize = (key: string) => {
    return i18next.t(key);
};

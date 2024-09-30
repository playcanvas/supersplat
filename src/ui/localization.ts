import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const localizeInit = () => {
    i18next
        .use(LanguageDetector)
        .init({
            detection: {
                order: ['querystring', /*'cookie', 'localStorage', 'sessionStorage',*/ 'navigator', 'htmlTag'],
            },
            supportedLngs: ['en', 'fr', 'ja', 'ko', 'zh-CN'],
            fallbackLng: 'en',
            resources: {
                en: {
                    translation: {
                        // Scene menu
                        "scene": "Scene",
                        "scene.new": "New",
                        "scene.open": "Open",
                        "scene.import": "Import",
                        "scene.load-all-data": "Load all PLY data",
                        "scene.save": "Save",
                        "scene.save-as": "Save As...",
                        "scene.export": "Export",
                        "scene.export.compressed-ply": "Compressed PLY",
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
                        "help.log-issue": "Log an Issue",
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

                        "options.add-pose": "Add Pose",
                        "options.prev-pose": "Previous Pose",
                        "options.next-pose": "Next Pose",
                        "options.play-poses": "Play Poses",
                        "options.clear-poses": "Clear Poses",

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

                        // Shortcuts panel
                        "shortcuts.title": "KEYBOARD SHORTCUTS",
                        "shortcuts.tools": "TOOLS",
                        "shortcuts.move": "Move",
                        "shortcuts.rotate": "Rotate",
                        "shortcuts.scale": "Scale",
                        "shortcuts.rect-selection": "Rect Selection",
                        "shortcuts.brush-selection": "Brush Selection",
                        "shortcuts.picker-selection": "Picker Selection",
                        "shortcuts.brush-size": "Decrease/Increase brush size",
                        "shortcuts.deactivate-tool": "Deactivate Tool",
                        "shortcuts.selection": "SELECTION",
                        "shortcuts.select-all": "Select All",
                        "shortcuts.deselect-all": "Deselect All",
                        "shortcuts.invert-selection": "Invert Selection",
                        "shortcuts.add-to-selection": "Add to Selection",
                        "shortcuts.remove-from-selection": "Remove from Selection",
                        "shortcuts.delete-selected-splats": "Delete Selected Splats",
                        "shortcuts.show": "SHOW",
                        "shortcuts.hide-selected-splats": "Hide Selected Splats",
                        "shortcuts.unhide-all-splats": "Unhide All Splats",
                        "shortcuts.toggle-data-panel": "Toggle Data Panel",
                        "shortcuts.other": "OTHER",
                        "shortcuts.select-next-splat": "Select Next Splat",
                        "shortcuts.undo": "Undo",
                        "shortcuts.redo": "Redo",
                        "shortcuts.toggle-splat-overlay": "Toggle Splat Overlay",
                        "shortcuts.focus-camera": "Focus Camera on current selection",
                        "shortcuts.toggle-camera-mode": "Toggle Camera Mode",
                        "shortcuts.toggle-grid": "Toggle Grid",
                        "shortcuts.toggle-gizmo-coordinate-space": "Toggle Gizmo Coordinate Space",

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
                fr: {
                    translation: {
                        // scene menu
                        "scene": "Scène",
                        "scene.new": "Créer",
                        "scene.open": "Ouvrir",
                        "scene.import": "Importer",
                        "scene.load-all-data": "Charger toutes les données ply",
                        "scene.save": "Enregistrer",
                        "scene.save-as": "Enregistrer sous...",
                        "scene.export": "Exporter",
                        "scene.export.compressed-ply": "Ply compressé",
                        "scene.export.splat": "Fichier splat",

                        // selection menu
                        "selection": "Sélection",
                        "selection.all": "Tout",
                        "selection.none": "Aucune",
                        "selection.invert": "Inverser",
                        "selection.lock": "Verrouiller la sélection",
                        "selection.unlock": "Tout débloquer",
                        "selection.delete": "Supprimer la sélection",
                        "selection.reset": "Réinitialiser splat",

                        // help menu
                        "help": "Aide",
                        "help.shortcuts": "Raccourcis claviers",
                        "help.user-guide": "Guide utilisateur",
                        "help.log-issue": "Signaler un problème",
                        "help.github-repo": "Dépôt GitHub",
                        "help.discord": "Serveur Discord",
                        "help.forum": "Forum",
                        "help.about": "À propos de SuperSplat",

                        // modes
                        "mode.centers": "Mode centres",
                        "mode.rings": "Mode anneaux",

                        // scene panel
                        "scene-manager": "GESTIONNAIRE DE SCENE",
                        "transform": "TRANSFORMATION",
                        "position": "Position",
                        "rotation": "Rotation",
                        "scale": "Échelle",

                        // options panel
                        "options": "OPTIONS D'AFFICHAGE",
                        "options.fov": "Champ de vision",
                        "options.sh-bands": "Ordres d'HS",
                        "options.centers-size": "Échelle des centres",
                        "options.show-grid": "Afficher la grille",
                        "options.show-bound": "Afficher limites",

                        // data panel
                        "data": "DONNEES SPLAT",
                        "data.distance": "Distance",
                        "data.volume": "Volume",
                        "data.surface-area": "Zone de surface",
                        "data.scale-x": "Échelle X",
                        "data.scale-y": "Échelle Y",
                        "data.scale-z": "Échelle Z",
                        "data.red": "Rouge",
                        "data.green": "Vert",
                        "data.blue": "Bleu",
                        "data.opacity": "Opacité",
                        "data.hue": "Teinte",
                        "data.saturation": "Saturation",
                        "data.value": "Luminosité",
                        "data.log-scale": "Échelle logarithmique",
                        "data.totals": "Totaux",
                        "data.totals.splats": "Splats",
                        "data.totals.selected": "Selectionné",
                        "data.totals.hidden": "Caché",
                        "data.totals.deleted": "Supprimé",

                        // Shortcuts panel
                        "shortcuts.title": "RACCOURCIS CLAVIERS",
                        "shortcuts.tools": "OUTILS",
                        "shortcuts.move": "Déplacer",
                        "shortcuts.rotate": "Tourner",
                        "shortcuts.scale": "Changer l'échelle",
                        "shortcuts.rect-selection": "Sélection avec rectangle",
                        "shortcuts.brush-selection": "Sélection avec pinceau",
                        "shortcuts.picker-selection": "Sélection avec pipette",
                        "shortcuts.brush-size": "Augmenter/Diminuer la taille du pinceau",
                        "shortcuts.deactivate-tool": "Désactiver l'outil",
                        "shortcuts.selection": "SELECTION",
                        "shortcuts.select-all": "Tout sélectionner",
                        "shortcuts.deselect-all": "Tout desélectionner",
                        "shortcuts.invert-selection": "Inverser la sélection",
                        "shortcuts.add-to-selection": "Ajouter à la sélection",
                        "shortcuts.remove-from-selection": "Retirer de la sélection",
                        "shortcuts.delete-selected-splats": "Supprimer splats sélectionnés",
                        "shortcuts.show": "AFFICHER",
                        "shortcuts.hide-selected-splats": "Masquer splats sélectionnés",
                        "shortcuts.unhide-all-splats": "Réafficher tous les splats",
                        "shortcuts.toggle-data-panel": "Afficher/Cacher l'onglet données",
                        "shortcuts.other": "AUTRES",
                        "shortcuts.select-next-splat": "Sélectionner le splat suivant",
                        "shortcuts.undo": "Annuler",
                        "shortcuts.redo": "Rétablir",
                        "shortcuts.toggle-splat-overlay": "Basculer affichage splat",
                        "shortcuts.focus-camera": "Focaliser la caméra sur la sélection actuelle",
                        "shortcuts.toggle-camera-mode": "Basculer le mode de camera",
                        "shortcuts.toggle-grid": "Afficher/Cacher la grille",
                        "shortcuts.toggle-gizmo-coordinate-space": "Basculer en espace de coordonnées Gizmo",

                        // popup
                        "popup.ok": "OK",
                        "popup.cancel": "Annuler",
                        "popup.yes": "Oui",
                        "popup.no": "Non",
                        "popup.error-loading": "Erreur de chargement du fichier",

                        // right toolbar
                        "tooltip.splat-mode": "Mode splat ( M )",
                        "tooltip.show-hide": "Afficher/cacher les splats ( Barre espace )",
                        "tooltip.frame-selection": "Cadrer la sélection ( F )",
                        "tooltip.view-options": "Options d'affichage",

                        // bottom toolbar
                        "tooltip.undo": "Annuler ( Ctrl + Z )",
                        "tooltip.redo": "Rétablir ( Ctrl + Shift + Z )",
                        "tooltip.picker": "Sélection avec pipette ( P )",
                        "tooltip.brush": "Sélection avec pinceau ( B )",
                        "tooltip.sphere": "Sélection avec sphère",
                        "tooltip.translate": "Translation ( 1 )",
                        "tooltip.rotate": "Rotation ( 2 )",
                        "tooltip.scale": "Échelle ( 3 )",
                        "tooltip.local-space": "Espace local gizmo"
                    }
                },
                ja: {
                    translation: {
                        // Scene menu
                        "scene": "シーン",
                        "scene.new": "新規作成",
                        "scene.open": "開く",
                        "scene.import": "インポート",
                        "scene.load-all-data": "全てのPLYデータを読み込む",
                        "scene.save": "保存",
                        "scene.save-as": "名前を付けて保存",
                        "scene.export": "エクスポート",
                        "scene.export.compressed-ply": "Compressed PLY ( .ply )",
                        "scene.export.splat": "Splat ( .splat )",

                        // Selection menu
                        "selection": "選択",
                        "selection.all": "全て",
                        "selection.none": "選択を解除",
                        "selection.invert": "反転",
                        "selection.lock": "選択をロック",
                        "selection.unlock": "ロックを解除",
                        "selection.delete": "選択を削除",
                        "selection.reset": "変更を全てリセット",

                        // Help menu
                        "help": "ヘルプ",
                        "help.shortcuts": "キーボードショートカット",
                        "help.user-guide": "ユーザーガイド",
                        "help.log-issue": "問題を報告",
                        "help.github-repo": "GitHubリポジトリ",
                        "help.discord": "Discordサーバー",
                        "help.forum": "フォーラム",
                        "help.about": "SuperSplatについて",

                        // Modes
                        "mode.centers": "センターモード",
                        "mode.rings": "リングモード",

                        // Scene panel
                        "scene-manager": "シーンマネージャー",
                        "transform": "トランスフォーム",
                        "position": "位置",
                        "rotation": "回転",
                        "scale": "スケール",

                        // Options panel
                        "options": "表示オプション",
                        "options.fov": "視野 ( FOV )",
                        "options.sh-bands": "球面調和関数のバンド",
                        "options.centers-size": "センターサイズ",
                        "options.show-grid": "グリッド",
                        "options.show-bound": "バウンディングボックス",

                        "options.add-pose": "ポーズを追加",
                        "options.prev-pose": "前のポーズ",
                        "options.next-pose": "次のポーズ",
                        "options.play-poses": "ポーズを再生",
                        "options.clear-poses": "ポーズをクリア",

                        // Data panel
                        "data": "スプラットの統計",
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
                        "data.totals.splats": "スプラット数",
                        "data.totals.selected": "選択中",
                        "data.totals.hidden": "非表示",
                        "data.totals.deleted": "削除",

                        // Shortcuts panel
                        "shortcuts.title": "キーボードショートカット",
                        "shortcuts.tools": "ツール",
                        "shortcuts.move": "移動",
                        "shortcuts.rotate": "回転",
                        "shortcuts.scale": "スケール",
                        "shortcuts.rect-selection": "四角形選択",
                        "shortcuts.brush-selection": "ブラシ選択",
                        "shortcuts.picker-selection": "ピッカー選択",
                        "shortcuts.brush-size": "ブラシサイズの増減",
                        "shortcuts.deactivate-tool": "ツールの非アクティブ化",
                        "shortcuts.selection": "選択",
                        "shortcuts.select-all": "全て選択",
                        "shortcuts.deselect-all": "全て選択解除",
                        "shortcuts.invert-selection": "選択反転",
                        "shortcuts.add-to-selection": "選択追加",
                        "shortcuts.remove-from-selection": "選択解除",
                        "shortcuts.delete-selected-splats": "選択削除",
                        "shortcuts.show": "表示",
                        "shortcuts.hide-selected-splats": "選択非表示",
                        "shortcuts.unhide-all-splats": "全て表示",
                        "shortcuts.toggle-data-panel": "データパネルの切り替え",
                        "shortcuts.other": "その他",
                        "shortcuts.select-next-splat": "次のスプラットを選択",
                        "shortcuts.undo": "元に戻す",
                        "shortcuts.redo": "やり直し",
                        "shortcuts.toggle-splat-overlay": "スプラットオーバーレイの切り替え",
                        "shortcuts.focus-camera": "カメラの焦点を合わせる",
                        "shortcuts.toggle-camera-mode": "カメラモードの切り替え",
                        "shortcuts.toggle-grid": "グリッドの切り替え",
                        "shortcuts.toggle-gizmo-coordinate-space": "ギズモ座標空間の切り替え",

                        // Popup
                        "popup.ok": "OK",
                        "popup.cancel": "キャンセル",
                        "popup.yes": "はい",
                        "popup.no": "いいえ",
                        "popup.error-loading": "ファイルの読み込みエラー",

                        // Right toolbar
                        "tooltip.splat-mode": "スプラットモード ( M )",
                        "tooltip.show-hide": "スプラットの表示/非表示 ( Space )",
                        "tooltip.frame-selection": "選択をフレームイン ( F )",
                        "tooltip.view-options": "表示オプション",

                        // Bottom toolbar
                        "tooltip.undo": "元に戻す ( Ctrl + Z )",
                        "tooltip.redo": "やり直し ( Ctrl + Shift + Z )",
                        "tooltip.picker": "ピッカー選択 ( P )",
                        "tooltip.brush": "ブラシ選択 ( B )",
                        "tooltip.sphere": "球で選択",
                        "tooltip.translate": "移動 ( 1 )",
                        "tooltip.rotate": "回転 ( 2 )",
                        "tooltip.scale": "スケール ( 3 )",
                        "tooltip.local-space": "ローカル座標へ切り替え"
                    }
                },
                ko: {
                    translation: {
                        // Scene menu
                        "scene": "장면",
                        "scene.new": "새로 만들기",
                        "scene.open": "열기",
                        "scene.import": "가져오기",
                        "scene.load-all-data": "모든 PLY 데이터 불러오기",
                        "scene.save": "저장",
                        "scene.save-as": "다른 이름으로 저장...",
                        "scene.export": "내보내기",
                        "scene.export.compressed-ply": "압축된 PLY",
                        "scene.export.splat": "Splat 파일",

                        // Selection menu
                        "selection": "선택",
                        "selection.all": "모두",
                        "selection.none": "없음",
                        "selection.invert": "반전",
                        "selection.lock": "선택 잠금",
                        "selection.unlock": "모두 잠금 해제",
                        "selection.delete": "선택 삭제",
                        "selection.reset": "Splat 재설정",

                        // Help menu
                        "help": "도움말",
                        "help.shortcuts": "키보드 단축키",
                        "help.user-guide": "사용자 가이드",
                        "help.log-issue": "문제 보고",
                        "help.github-repo": "GitHub 저장소",
                        "help.discord": "Discord 서버",
                        "help.forum": "포럼",
                        "help.about": "SuperSplat 정보",

                        // Modes
                        "mode.centers": "센터 모드",
                        "mode.rings": "링 모드",

                        // Scene panel
                        "scene-manager": "장면 관리자",
                        "transform": "변환",
                        "position": "위치",
                        "rotation": "회전",
                        "scale": "크기",

                        // Options panel
                        "options": "보기 옵션",
                        "options.fov": "시야각",
                        "options.sh-bands": "SH 밴드",
                        "options.centers-size": "센터 크기",
                        "options.show-grid": "그리드 표시",
                        "options.show-bound": "경계 표시",

                        "options.add-pose": "포즈 추가",
                        "options.prev-pose": "이전 포즈",
                        "options.next-pose": "다음 포즈",
                        "options.play-poses": "포즈 재생",
                        "options.clear-poses": "포즈 지우기",

                        // Data panel
                        "data": "SPLAT 데이터",
                        "data.distance": "거리",
                        "data.volume": "부피",
                        "data.surface-area": "표면적",
                        "data.scale-x": "크기 X",
                        "data.scale-y": "크기 Y",
                        "data.scale-z": "크기 Z",
                        "data.red": "빨강",
                        "data.green": "녹색",
                        "data.blue": "파랑",
                        "data.opacity": "불투명도",
                        "data.hue": "색조",
                        "data.saturation": "채도",
                        "data.value": "명도",
                        "data.log-scale": "로그 크기",
                        "data.totals": "합계",
                        "data.totals.splats": "Splat",
                        "data.totals.selected": "선택",
                        "data.totals.hidden": "숨겨진",
                        "data.totals.deleted": "삭제된",

                        // Shortcuts panel
                        "shortcuts.title": "키보드 단축키",
                        "shortcuts.tools": "도구",
                        "shortcuts.move": "이동",
                        "shortcuts.rotate": "회전",
                        "shortcuts.scale": "크기 조정",
                        "shortcuts.rect-selection": "사각형 선택",
                        "shortcuts.brush-selection": "브러시 선택",
                        "shortcuts.picker-selection": "피커 선택",
                        "shortcuts.brush-size": "브러시 크기 조정",
                        "shortcuts.deactivate-tool": "도구 비활성화",
                        "shortcuts.selection": "선택",
                        "shortcuts.select-all": "모두 선택",
                        "shortcuts.deselect-all": "모두 선택 해제",
                        "shortcuts.invert-selection": "선택 반전",
                        "shortcuts.add-to-selection": "선택 추가",
                        "shortcuts.remove-from-selection": "선택 제거",
                        "shortcuts.delete-selected-splats": "선택된 Splat 삭제",
                        "shortcuts.show": "표시",
                        "shortcuts.hide-selected-splats": "선택된 Splat 숨기기",
                        "shortcuts.unhide-all-splats": "모든 Splat 표시",
                        "shortcuts.toggle-data-panel": "데이터 패널 전환",
                        "shortcuts.other": "기타",
                        "shortcuts.select-next-splat": "다음 Splat 선택",
                        "shortcuts.undo": "실행 취소",
                        "shortcuts.redo": "다시 실행",
                        "shortcuts.toggle-splat-overlay": "Splat 오버레이 전환",
                        "shortcuts.focus-camera": "현재 선택에 초점 맞추기",
                        "shortcuts.toggle-camera-mode": "카메라 모드 전환",
                        "shortcuts.toggle-grid": "그리드 전환",
                        "shortcuts.toggle-gizmo-coordinate-space": "기즈모 좌표 공간 전환",

                        // Popup
                        "popup.ok": "확인",
                        "popup.cancel": "취소",
                        "popup.yes": "예",
                        "popup.no": "아니요",
                        "popup.error-loading": "파일 로드 오류",

                        // Right toolbar
                        "tooltip.splat-mode": "Splat 모드 ( M )",
                        "tooltip.show-hide": "스플래츠 표시/숨기기 ( Space )",
                        "tooltip.frame-selection": "프레임 선택 ( F )",
                        "tooltip.view-options": "보기 옵션",

                        // Bottom toolbar
                        "tooltip.undo": "실행 취소 ( Ctrl + Z )",
                        "tooltip.redo": "다시 실행 ( Ctrl + Shift + Z )",
                        "tooltip.picker": "피커 선택 ( P )",
                        "tooltip.brush": "브러시 선택 ( B )",
                        "tooltip.sphere": "구 선택",
                        "tooltip.translate": "이동 ( 1 )",
                        "tooltip.rotate": "회전 ( 2 )",
                        "tooltip.scale": "크기 조정 ( 3 )",
                        "tooltip.local-space": "로컬 공간"
                    }
                },
                "zh-CN": {
                    translation: {
                        // Scene menu
                        "scene": "场景",
                        "scene.new": "新建",
                        "scene.open": "打开",
                        "scene.import": "导入",
                        "scene.load-all-data": "加载所有 PLY 数据",
                        "scene.save": "保存",
                        "scene.save-as": "另存为...",
                        "scene.export": "导出",
                        "scene.export.compressed-ply": "压缩 PLY",
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
                        "help.log-issue": "报告问题",
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

                        "options.add-pose": "添加姿势",
                        "options.prev-pose": "上一个姿势",
                        "options.next-pose": "下一个姿势",
                        "options.play-poses": "播放姿势",
                        "options.clear-poses": "清除姿势",

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

                        // Shortcuts panel
                        "shortcuts.title": "键盘快捷键",
                        "shortcuts.tools": "工具",
                        "shortcuts.move": "移动",
                        "shortcuts.rotate": "旋转",
                        "shortcuts.scale": "缩放",
                        "shortcuts.rect-selection": "矩形选择",
                        "shortcuts.brush-selection": "画笔选择",
                        "shortcuts.picker-selection": "拾取选择",
                        "shortcuts.brush-size": "减小/增大画笔大小",
                        "shortcuts.deactivate-tool": "停用工具",
                        "shortcuts.selection": "选择",
                        "shortcuts.select-all": "全选",
                        "shortcuts.deselect-all": "取消全选",
                        "shortcuts.invert-selection": "反选",
                        "shortcuts.add-to-selection": "添加到选择",
                        "shortcuts.remove-from-selection": "从选择中移除",
                        "shortcuts.delete-selected-splats": "删除选择的 Splat",
                        "shortcuts.show": "显示",
                        "shortcuts.hide-selected-splats": "隐藏选择的 Splat",
                        "shortcuts.unhide-all-splats": "显示全部 Splat",
                        "shortcuts.toggle-data-panel": "切换数据面板",
                        "shortcuts.other": "其他",
                        "shortcuts.select-next-splat": "选择下一个 Splat",
                        "shortcuts.undo": "撤销",
                        "shortcuts.redo": "重做",
                        "shortcuts.toggle-splat-overlay": "切换 Splat 叠加",
                        "shortcuts.focus-camera": "聚焦当前选择",
                        "shortcuts.toggle-camera-mode": "切换相机模式",
                        "shortcuts.toggle-grid": "切换网格",
                        "shortcuts.toggle-gizmo-coordinate-space": "切换 Gizmo 坐标空间",

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

const localize = (key: string) => {
    return i18next.t(key);
};

export { localizeInit, localize };

import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const localizeInit = () => {
    i18next
    .use(LanguageDetector)
    .init({
        detection: {
            order: ['querystring', /* 'cookie', 'localStorage', 'sessionStorage',*/ 'navigator', 'htmlTag']
        },
        supportedLngs: ['de', 'en', 'fr', 'ja', 'ko', 'zh-CN'],
        fallbackLng: 'en',
        resources: {
            de: {
                translation: {
                    // File menu
                    'file': 'Datei',
                    'file.new': 'Neu',
                    'file.open': 'Öffnen',
                    'file.import': 'Importieren...',
                    'file.load-all-data': 'PLY-Daten vollständig laden',
                    'file.save': 'Speichern',
                    'file.save-as': 'Speichern als...',
                    'file.publish': 'Veröffentlichen...',
                    'file.export': 'Exportieren',
                    'file.export.compressed-ply': 'Komprimiertes PLY',
                    'file.export.splat': 'Splat',
                    'file.export.viewer': 'Viewer App...',

                    // Selection menu
                    'select': 'Auswahl',
                    'select.all': 'Alles',
                    'select.none': 'Aufheben',
                    'select.invert': 'Invertieren',
                    'select.lock': 'Selektion sperren',
                    'select.unlock': 'Sperre aufheben',
                    'select.delete': 'Selektion aufheben',
                    'select.reset': 'Splats zurücksetzen',
                    'select.duplicate': 'Duplizieren',
                    'select.separate': 'Separieren',

                    // Help menu
                    'help': 'Hilfe',
                    'help.shortcuts': 'Tastaturkürzel',
                    'help.user-guide': 'Handbuch',
                    'help.log-issue': 'Problem melden',
                    'help.github-repo': 'GitHub Repository',
                    'help.basics-video': 'Grundlagen Video',
                    'help.discord': 'Discord Server',
                    'help.forum': 'Forum',
                    'help.about': 'Über SuperSplat',

                    // Modes
                    'mode.centers': 'Punkt Modus',
                    'mode.rings': 'Ring Modus',

                    // Scene panel
                    'scene-manager': 'SZENEN MANAGER',
                    'transform': 'TRANSFORMATION',
                    'position': 'Position',
                    'rotation': 'Rotation',
                    'scale': 'Skalierung',

                    // Options panel
                    'options': 'ANSICHTS OPTIONEN',
                    'options.colors': 'Farben',
                    'options.bg-color': 'Hintergrundfarbe',
                    'options.selected-color': 'Selektierte Farbe',
                    'options.unselected-color': 'Nicht selektierte Farbe',
                    'options.locked-color': 'Gesperrte Farbe',
                    'options.fov': 'Sichtfeld (FoV)',
                    'options.sh-bands': 'SH Bänder',
                    'options.centers-size': 'Punktgrößen',
                    'options.outline-selection': 'Umriss Selektion',
                    'options.show-grid': 'Raster anzeigen',
                    'options.show-bound': 'Objektbox anzeigen',
                    'options.camera-fly-speed': 'Kamera Geschwindigkeit',

                    // Camera panel
                    'camera': 'KAMERA POSEN',
                    'camera.add-pose': 'Pose hinzufügen',
                    'camera.prev-pose': 'Vorherige Pose',
                    'camera.next-pose': 'Nächste Pose',
                    'camera.play-poses': 'Posen abspielen',
                    'camera.clear-poses': 'Posen leeren',

                    // Color panel
                    'colors': 'FARBE',
                    'colors.tint': 'Färbung',
                    'colors.temperature': 'Temperatur',
                    'colors.saturation': 'Sättigung',
                    'colors.brightness': 'Helligkeit',
                    'colors.blackPoint': 'Schwarzpunkt',
                    'colors.whitePoint': 'Weißpunkt',
                    'colors.transparency': 'Transparenz',
                    'colors.reset': 'Zurücksetzen',

                    // Data panel
                    'data': 'SPLAT DATEN',
                    'data.distance': 'Entfernung',
                    'data.volume': 'Volumen',
                    'data.surface-area': 'Oberfläche',
                    'data.scale-x': 'Größe X',
                    'data.scale-y': 'Größe Y',
                    'data.scale-z': 'Größe Z',
                    'data.red': 'Rot',
                    'data.green': 'Grün',
                    'data.blue': 'Blau',
                    'data.opacity': 'Deckkraft',
                    'data.hue': 'Farbe',
                    'data.saturation': 'Sättigung',
                    'data.value': 'Helligkeit',
                    'data.log-scale': 'Logarithmische Skala',
                    'data.totals': 'Summe',
                    'data.totals.splats': 'Splats',
                    'data.totals.selected': 'Selektiert',
                    'data.totals.hidden': 'Ausgeblendet',
                    'data.totals.deleted': 'Gelöscht',

                    // Shortcuts panel
                    'shortcuts.title': 'TASTATURKÜRZEL',
                    'shortcuts.tools': 'WERKZEUGE',
                    'shortcuts.move': 'Bewegen',
                    'shortcuts.rotate': 'Drehen',
                    'shortcuts.scale': 'Skalieren',
                    'shortcuts.rect-selection': 'Rechteckselektion',
                    'shortcuts.brush-selection': 'Pinselselektion',
                    'shortcuts.picker-selection': 'Einzelselektion',
                    'shortcuts.brush-size': 'Pinsel Verkleinern/Vergrößern',
                    'shortcuts.deactivate-tool': 'Werkzeug deaktivieren',
                    'shortcuts.selection': 'SELEKTION',
                    'shortcuts.select-all': 'Alle Selektieren',
                    'shortcuts.deselect-all': 'Selektion aufheben',
                    'shortcuts.invert-selection': 'Selektion invertieren',
                    'shortcuts.add-to-selection': 'Zur Selektion hinzufügen',
                    'shortcuts.remove-from-selection': 'Von Selektion entfernen',
                    'shortcuts.delete-selected-splats': 'Selektierte Splats löschen',
                    'shortcuts.show': 'ANZEIGEN',
                    'shortcuts.hide-selected-splats': 'Selektierte Splats ausblenden',
                    'shortcuts.unhide-all-splats': 'Alle Splats einblenden',
                    'shortcuts.toggle-data-panel': 'Splat Daten Panel anzeigen',
                    'shortcuts.other': 'WEITERE',
                    'shortcuts.select-next-splat': 'Nächsten Splat selektieren',
                    'shortcuts.undo': 'Rückgängig',
                    'shortcuts.redo': 'Wiederholen',
                    'shortcuts.toggle-splat-overlay': 'Splateinblendung umschalten',
                    'shortcuts.focus-camera': 'Kamera auf selektion ausrichten',
                    'shortcuts.toggle-camera-mode': 'Kameramodus umschalten',
                    'shortcuts.toggle-grid': 'Rasteranzeige umschalten',
                    'shortcuts.toggle-gizmo-coordinate-space': 'Gizmoanzeige umschalten',

                    // Popup
                    'popup.ok': 'OK',
                    'popup.cancel': 'Abbrechen',
                    'popup.yes': 'Ja',
                    'popup.no': 'Nein',
                    'popup.error': 'FEHLER',
                    'popup.error-loading': 'FEHLER BEIM LADEN DER DATEI',
                    'popup.drop-files': 'Bitte Dateien und Ordner ablegen',
                    'popup.copy-to-clipboard': 'Link in die Zwischenablage kopieren',

                    // Right toolbar
                    'tooltip.splat-mode': 'Splat Modus ( M )',
                    'tooltip.show-hide': 'Anzeigen/Ausplenden Splats ( Leertaste )',
                    'tooltip.frame-selection': 'Rechteckselektion ( F )',
                    'tooltip.camera-reset': 'Kamera zurücksetzen',
                    'tooltip.color-panel': 'Farben',
                    'tooltip.view-options': 'Anzeige Optionen',

                    // Bottom toolbar
                    'tooltip.undo': 'Rückgängig ( Strg + Z )',
                    'tooltip.redo': 'Wiederholen ( Strg + Shift + Z )',
                    'tooltip.picker': 'Einzelselektion ( R )',
                    'tooltip.polygon': 'Polygonselektion ( P )',
                    'tooltip.brush': 'Pinselselektion ( B )',
                    'tooltip.sphere': 'Kugelselektion',
                    'tooltip.fly-delete': 'Fluglöschwerkzeug', // Added
                    'tooltip.fly-select': 'Flugauswahl', // Added tooltip for fly select
                    'tooltip.translate': 'Verschieben ( 1 )',
                    'tooltip.rotate': 'Drehen ( 2 )',
                    'tooltip.scale': 'Skalieren ( 3 )',
                    'tooltip.local-space': 'Gizmo in local-space',
                    'tooltip.bound-center': 'Mittelpunkt verwenden',

                    // Viewer Export
                    'export.type': 'Export Typ',
                    'export.html': 'HTML',
                    'export.package': 'ZIP Paket',
                    'export.sh-bands': 'SH Bänder',
                    'export.start-position': 'Start Position',
                    'export.default': 'Standard',
                    'export.viewport': 'Aktuelle Ansicht',
                    'export.pose-camera': '1. Kamera Pose',
                    'export.fov': 'Sichtfeld (FoV)',
                    'export.background-color': 'Hintergrund',
                    'export.filename': 'Dateiname',

                    // Cursor
                    'cursor.click-to-copy': 'Klicken zum kopieren',
                    'cursor.copied': 'Kopiert!',

                    // Doc
                    'doc.reset': 'SZENE ZURÜCKSETZEN',
                    'doc.unsaved-message': 'Sie haben ungespeicherte Änderungen. Möchten Sie die Szene wirklich zurücksetzen?',
                    'doc.reset-message': 'Möchten Sie die Szene wirklich zurücksetzen?',
                    'doc.save-failed': 'FEHLGESCHLAGEN ZU SPEICHERN',
                    'doc.load-failed': 'FEHLGESCHLAGEN ZU LADEN',

                    // Publish Settings Dialog
                    'publish.header': 'VERÖFFENTLICHEN EINSTELLUNGEN',
                    'publish.ok': 'Veröffentlichen',
                    'publish.cancel': 'Abbrechen',
                    'publish.title': 'Titel',
                    'publish.description': 'Beschreibung',
                    'publish.listed': 'Aufgelistet',
                    'publish.failed': 'VERÖFFENTLICHEN FEHLGESCHLAGEN',
                    'publish.please-try-again': 'Bitte versuchen Sie es später erneut.',
                    'publish.succeeded': 'VERÖFFENTLICHEN ERFOLGREICH',
                    'publish.message': 'Verwenden Sie den Link unten, um auf Ihre Szene zuzugreifen.',
                    'publish.please-log-in': 'Das Veröffentlichen in PlayCanvas erfordert ein Benutzerkonto. Bitte melden Sie sich an und versuchen Sie es erneut.',

                    // Video Settings Dialog
                    'video.header': 'VIDEO EINSTELLUNGEN',
                    'video.resolution': 'Auflösung',
                    'video.frameRate': 'Bildrate',
                    'video.bitrate': 'Bitrate',
                    'video.portrait': 'Hochformat',
                    'video.transparentBg': 'Transparenter Hintergrund',
                    'video.showDebug': 'Debug-Überlagerungen anzeigen',

                    // Timeline
                    'timeline.prev-key': 'Zur vorherigen Keyframe springen',
                    'timeline.play': 'Abspielen/Stoppen',
                    'timeline.next-key': 'Zur nächsten Keyframe springen',
                    'timeline.add-key': 'Key hinzufügen',
                    'timeline.remove-key': 'Key entfernen',
                    'timeline.frame-rate': 'Bildrate',
                    'timeline.total-frames': 'Gesamtanzahl der Frames'
                }
            },
            en: {
                translation: {
                    // File menu
                    'file': 'File',
                    'file.new': 'New',
                    'file.open': 'Open',
                    'file.import': 'Import...',
                    'file.load-all-data': 'Load all PLY data',
                    'file.save': 'Save',
                    'file.save-as': 'Save As...',
                    'file.publish': 'Publish...',
                    'file.export': 'Export',
                    'file.export.ply': 'PLY (.ply)',
                    'file.export.compressed-ply': 'Compressed PLY (.ply)',
                    'file.export.splat': 'Splat file (.splat)',
                    'file.export.viewer': 'Viewer App...',

                    'render': 'Render',
                    'render.image': 'Image',
                    'render.video': 'Video...',
                    'render.ok': 'Render',
                    'render.cancel': 'Cancel',

                    // Selection menu
                    'select': 'Select',
                    'select.all': 'All',
                    'select.none': 'None',
                    'select.invert': 'Invert',
                    'select.lock': 'Lock Selection',
                    'select.unlock': 'Unlock All',
                    'select.delete': 'Delete Selection',
                    'select.reset': 'Reset Splat',
                    'select.duplicate': 'Duplicate',
                    'select.separate': 'Separate',

                    // Help menu
                    'help': 'Help',
                    'help.shortcuts': 'Keyboard Shortcuts',
                    'help.user-guide': 'User Guide',
                    'help.log-issue': 'Log an Issue',
                    'help.github-repo': 'GitHub Repo',
                    'help.basics-video': 'Basics Video',
                    'help.discord': 'Discord Server',
                    'help.forum': 'Forum',
                    'help.about': 'About SuperSplat',

                    // Modes
                    'mode.centers': 'Centers Mode',
                    'mode.rings': 'Rings Mode',

                    // Scene panel
                    'scene-manager': 'SCENE MANAGER',
                    'transform': 'TRANSFORM',
                    'position': 'Position',
                    'rotation': 'Rotation',
                    'scale': 'Scale',

                    // Options panel
                    'options': 'VIEW OPTIONS',
                    'options.colors': 'Colors',
                    'options.bg-color': 'Background Color',
                    'options.selected-color': 'Selected Color',
                    'options.unselected-color': 'Unselected Color',
                    'options.locked-color': 'Locked Color',
                    'options.fov': 'Field of View',
                    'options.sh-bands': 'SH Bands',
                    'options.centers-size': 'Centers Size',
                    'options.outline-selection': 'Outline Selection',
                    'options.show-grid': 'Show Grid',
                    'options.show-bound': 'Show Bound',
                    'options.camera-fly-speed': 'Fly Speed',
                    'options.tonemapping': 'Tonemapping',
                    'options.tonemapping-none': 'None',
                    'options.tonemapping-linear': 'Linear',
                    'options.tonemapping-neutral': 'Neutral',
                    'options.tonemapping-aces': 'ACES',
                    'options.tonemapping-aces2': 'ACES2',
                    'options.tonemapping-filmic': 'Filmic',
                    'options.tonemapping-hejl': 'Hejl',

                    // Camera panel
                    'camera': 'CAMERA POSES',
                    'camera.add-pose': 'Add Pose',
                    'camera.prev-pose': 'Previous Pose',
                    'camera.next-pose': 'Next Pose',
                    'camera.play-poses': 'Play Poses',
                    'camera.clear-poses': 'Clear Poses',

                    // Color panel
                    'colors': 'COLORS',
                    'colors.tint': 'Tint',
                    'colors.temperature': 'Temperature',
                    'colors.saturation': 'Saturation',
                    'colors.brightness': 'Brightness',
                    'colors.blackPoint': 'Black Point',
                    'colors.whitePoint': 'White Point',
                    'colors.transparency': 'Transparency',
                    'colors.reset': 'Reset',

                    // Data panel
                    'data': 'SPLAT DATA',
                    'data.distance': 'Distance',
                    'data.volume': 'Volume',
                    'data.surface-area': 'Surface Area',
                    'data.scale-x': 'Scale X',
                    'data.scale-y': 'Scale Y',
                    'data.scale-z': 'Scale Z',
                    'data.red': 'Red',
                    'data.green': 'Green',
                    'data.blue': 'Blue',
                    'data.opacity': 'Opacity',
                    'data.hue': 'Hue',
                    'data.saturation': 'Saturation',
                    'data.value': 'Value',
                    'data.log-scale': 'Log Scale',
                    'data.totals': 'Totals',
                    'data.totals.splats': 'Splats',
                    'data.totals.selected': 'Selected',
                    'data.totals.hidden': 'Hidden',
                    'data.totals.deleted': 'Deleted',

                    // Shortcuts panel
                    'shortcuts.title': 'KEYBOARD SHORTCUTS',
                    'shortcuts.tools': 'TOOLS',
                    'shortcuts.move': 'Move',
                    'shortcuts.rotate': 'Rotate',
                    'shortcuts.scale': 'Scale',
                    'shortcuts.rect-selection': 'Rect Selection',
                    'shortcuts.brush-selection': 'Brush Selection',
                    'shortcuts.picker-selection': 'Picker Selection',
                    'shortcuts.brush-size': 'Decrease/Increase brush size',
                    'shortcuts.deactivate-tool': 'Deactivate Tool',
                    'shortcuts.selection': 'SELECTION',
                    'shortcuts.select-all': 'Select All',
                    'shortcuts.deselect-all': 'Deselect All',
                    'shortcuts.invert-selection': 'Invert Selection',
                    'shortcuts.add-to-selection': 'Add to Selection',
                    'shortcuts.remove-from-selection': 'Remove from Selection',
                    'shortcuts.delete-selected-splats': 'Delete Selected Splats',
                    'shortcuts.show': 'SHOW',
                    'shortcuts.hide-selected-splats': 'Hide Selected Splats',
                    'shortcuts.unhide-all-splats': 'Unhide All Splats',
                    'shortcuts.toggle-data-panel': 'Toggle Data Panel',
                    'shortcuts.other': 'OTHER',
                    'shortcuts.select-next-splat': 'Select Next Splat',
                    'shortcuts.undo': 'Undo',
                    'shortcuts.redo': 'Redo',
                    'shortcuts.toggle-splat-overlay': 'Toggle Splat Overlay',
                    'shortcuts.focus-camera': 'Focus Camera on current selection',
                    'shortcuts.toggle-camera-mode': 'Toggle Camera Mode',
                    'shortcuts.toggle-grid': 'Toggle Grid',
                    'shortcuts.toggle-gizmo-coordinate-space': 'Toggle Gizmo Coordinate Space',

                    // Popup
                    'popup.ok': 'OK',
                    'popup.cancel': 'Cancel',
                    'popup.yes': 'Yes',
                    'popup.no': 'No',
                    'popup.error': 'ERROR',
                    'popup.error-loading': 'ERROR LOADING FILE',
                    'popup.drop-files': 'Please drop files and folders',
                    'popup.copy-to-clipboard': 'Copy link to clipboard',

                    // Right toolbar
                    'tooltip.splat-mode': 'Splat Mode ( M )',
                    'tooltip.show-hide': 'Show/Hide Splats ( Space )',
                    'tooltip.frame-selection': 'Frame Selection ( F )',
                    'tooltip.camera-reset': 'Reset Camera',
                    'tooltip.color-panel': 'Colors',
                    'tooltip.view-options': 'View Options',

                    // Bottom toolbar
                    'tooltip.undo': 'Undo ( Ctrl + Z )',
                    'tooltip.redo': 'Redo ( Ctrl + Shift + Z )',
                    'tooltip.picker': 'Picker Select ( R )',
                    'tooltip.polygon': 'Polygon Select ( P )',
                    'tooltip.brush': 'Brush Select ( B )',
                    'tooltip.sphere': 'Sphere Select',
                    'tooltip.fly-delete': 'Fly Deletion Tool', // Added
                    'tooltip.fly-select': 'Fly Select', // Added tooltip for fly select
                    'tooltip.translate': 'Translate ( 1 )',
                    'tooltip.rotate': 'Rotate ( 2 )',
                    'tooltip.scale': 'Scale ( 3 )',
                    'tooltip.local-space': 'Use Local Orientation',
                    'tooltip.bound-center': 'Use Bound Center',

                    // Viewer Export
                    'export.header': 'VIEWER EXPORT',
                    'export.type': 'Export Type',
                    'export.html': 'HTML',
                    'export.package': 'ZIP Package',
                    'export.sh-bands': 'SH Bands',
                    'export.start-position': 'Start Position',
                    'export.default': 'Default',
                    'export.viewport': 'Current Viewport',
                    'export.pose-camera': '1st Camera Pose',
                    'export.fov': 'Field of View',
                    'export.background-color': 'Background',
                    'export.filename': 'Filename',
                    'export.animation': 'Animation',
                    'export.animation-none': 'None',
                    'export.animation-track': 'Track',

                    // Cursor
                    'cursor.click-to-copy': 'Click to copy',
                    'cursor.copied': 'Copied!',

                    // Doc
                    'doc.reset': 'RESET SCENE',
                    'doc.unsaved-message': 'You have unsaved changes. Are you sure you want to reset the scene?',
                    'doc.reset-message': 'Are you sure you want to reset the scene?',
                    'doc.save-failed': 'FAILED TO SAVE',
                    'doc.load-failed': 'FAILED TO LOAD',

                    // Publish Settings Dialog
                    'publish.header': 'PUBLISH SETTINGS',
                    'publish.ok': 'Publish',
                    'publish.cancel': 'Cancel',
                    'publish.title': 'Title',
                    'publish.description': 'Description',
                    'publish.listed': 'Listed',
                    'publish.failed': 'PUBLISH FAILED',
                    'publish.please-try-again': 'Please try again later.',
                    'publish.succeeded': 'PUBLISH SUCCEEDED',
                    'publish.message': 'Use the link below to access your scene.',
                    'publish.please-log-in': 'Publishing to PlayCanvas requires a user account. Please log in and try again.',

                    // Video Settings Dialog
                    'video.header': 'VIDEO SETTINGS',
                    'video.resolution': 'Resolution',
                    'video.frameRate': 'Frame Rate',
                    'video.bitrate': 'Bitrate',
                    'video.portrait': 'Portrait Mode',
                    'video.transparentBg': 'Transparent Background',
                    'video.showDebug': 'Show Debug Overlays',

                    // Timeline
                    'timeline.prev-key': 'Jump to previous keyframe',
                    'timeline.play': 'Play/Stop',
                    'timeline.next-key': 'Jump to next keyframe',
                    'timeline.add-key': 'Add Key',
                    'timeline.remove-key': 'Remove Key',
                    'timeline.frame-rate': 'Frame Rate',
                    'timeline.total-frames': 'Total Frames'
                }
            },
            fr: {
                translation: {
                    // File menu
                    'file': 'Fichier',
                    'file.new': 'Créer',
                    'file.open': 'Ouvrir',
                    'file.import': 'Importer...',
                    'file.load-all-data': 'Charger toutes les données ply',
                    'file.save': 'Enregistrer',
                    'file.save-as': 'Enregistrer sous...',
                    'file.publish': 'Publier...',
                    'file.export': 'Exporter',
                    'file.export.compressed-ply': 'Ply compressé',
                    'file.export.splat': 'Fichier splat',
                    'file.export.viewer': 'Application de visualisation...',

                    // Selection menu
                    'select': 'Sélection',
                    'select.all': 'Tout',
                    'select.none': 'Aucune',
                    'select.invert': 'Inverser',
                    'select.lock': 'Verrouiller la sélection',
                    'select.unlock': 'Tout débloquer',
                    'select.delete': 'Supprimer la sélection',
                    'select.reset': 'Réinitialiser splat',
                    'select.duplicate': 'Dupliquer',
                    'select.separate': 'Séparer',

                    // Help menu
                    'help': 'Aide',
                    'help.shortcuts': 'Raccourcis claviers',
                    'help.user-guide': 'Guide utilisateur',
                    'help.log-issue': 'Signaler un problème',
                    'help.github-repo': 'Dépôt GitHub',
                    'help.basics-video': 'Vidéo de base',
                    'help.discord': 'Serveur Discord',
                    'help.forum': 'Forum',
                    'help.about': 'À propos de SuperSplat',

                    // Modes
                    'mode.centers': 'Mode centres',
                    'mode.rings': 'Mode anneaux',

                    // Scene panel
                    'scene-manager': 'GESTIONNAIRE DE SCENE',
                    'transform': 'TRANSFORMATION',
                    'position': 'Position',
                    'rotation': 'Rotation',
                    'scale': 'Échelle',

                    // Options panel
                    'options': 'OPTIONS D\'AFFICHAGE',
                    'options.colors': 'Couleurs',
                    'options.bg-color': 'Couleur de fond',
                    'options.selected-color': 'Couleur sélectionnée',
                    'options.unselected-color': 'Couleur non sélectionnée',
                    'options.locked-color': 'Couleur verrouillée',
                    'options.fov': 'Champ de vision',
                    'options.sh-bands': 'Ordres d\'HS',
                    'options.centers-size': 'Échelle des centres',
                    'options.outline-selection': 'Contour de la sélection',
                    'options.show-grid': 'Afficher la grille',
                    'options.show-bound': 'Afficher limites',
                    'options.camera-fly-speed': 'Vitesse de vol',

                    // Camera panel
                    'camera': 'POSES DE LA CAMERA',
                    'camera.add-pose': 'Ajouter une pose',
                    'camera.prev-pose': 'Pose précédente',
                    'camera.next-pose': 'Pose suivante',
                    'camera.play-poses': 'Lire les poses',
                    'camera.clear-poses': 'Effacer les poses',

                    // Color panel
                    'colors': 'COULEURS',
                    'colors.tint': 'Teinte',
                    'colors.temperature': 'Température',
                    'colors.saturation': 'Saturation',
                    'colors.brightness': 'Luminosité',
                    'colors.blackPoint': 'Point noir',
                    'colors.whitePoint': 'Point blanc',
                    'colors.transparency': 'Transparence',
                    'colors.reset': 'Réinitialiser',

                    // Data panel
                    'data': 'DONNEES SPLAT',
                    'data.distance': 'Distance',
                    'data.volume': 'Volume',
                    'data.surface-area': 'Zone de surface',
                    'data.scale-x': 'Échelle X',
                    'data.scale-y': 'Échelle Y',
                    'data.scale-z': 'Échelle Z',
                    'data.red': 'Rouge',
                    'data.green': 'Vert',
                    'data.blue': 'Bleu',
                    'data.opacity': 'Opacité',
                    'data.hue': 'Teinte',
                    'data.saturation': 'Saturation',
                    'data.value': 'Luminosité',
                    'data.log-scale': 'Échelle logarithmique',
                    'data.totals': 'Totaux',
                    'data.totals.splats': 'Splats',
                    'data.totals.selected': 'Selectionné',
                    'data.totals.hidden': 'Caché',
                    'data.totals.deleted': 'Supprimé',

                    // Shortcuts panel
                    'shortcuts.title': 'RACCOURCIS CLAVIERS',
                    'shortcuts.tools': 'OUTILS',
                    'shortcuts.move': 'Déplacer',
                    'shortcuts.rotate': 'Tourner',
                    'shortcuts.scale': 'Changer l\'échelle',
                    'shortcuts.rect-selection': 'Sélection avec rectangle',
                    'shortcuts.brush-selection': 'Sélection avec pinceau',
                    'shortcuts.picker-selection': 'Sélection avec pipette',
                    'shortcuts.brush-size': 'Augmenter/Diminuer la taille du pinceau',
                    'shortcuts.deactivate-tool': 'Désactiver l\'outil',
                    'shortcuts.selection': 'SELECTION',
                    'shortcuts.select-all': 'Tout sélectionner',
                    'shortcuts.deselect-all': 'Tout desélectionner',
                    'shortcuts.invert-selection': 'Inverser la sélection',
                    'shortcuts.add-to-selection': 'Ajouter à la sélection',
                    'shortcuts.remove-from-selection': 'Retirer de la sélection',
                    'shortcuts.delete-selected-splats': 'Supprimer splats sélectionnés',
                    'shortcuts.show': 'AFFICHER',
                    'shortcuts.hide-selected-splats': 'Masquer splats sélectionnés',
                    'shortcuts.unhide-all-splats': 'Réafficher tous les splats',
                    'shortcuts.toggle-data-panel': 'Afficher/Cacher l\'onglet données',
                    'shortcuts.other': 'AUTRES',
                    'shortcuts.select-next-splat': 'Sélectionner le splat suivant',
                    'shortcuts.undo': 'Annuler',
                    'shortcuts.redo': 'Rétablir',
                    'shortcuts.toggle-splat-overlay': 'Basculer affichage splat',
                    'shortcuts.focus-camera': 'Focaliser la caméra sur la sélection actuelle',
                    'shortcuts.toggle-camera-mode': 'Basculer le mode de camera',
                    'shortcuts.toggle-grid': 'Afficher/Cacher la grille',
                    'shortcuts.toggle-gizmo-coordinate-space': 'Basculer en espace de coordonnées Gizmo',

                    // Popup
                    'popup.ok': 'OK',
                    'popup.cancel': 'Annuler',
                    'popup.yes': 'Oui',
                    'popup.no': 'Non',
                    'popup.error': 'ERREUR',
                    'popup.error-loading': 'Erreur de chargement du fichier',
                    'popup.drop-files': 'Veuillez déposer des fichiers et des dossiers',
                    'popup.copy-to-clipboard': 'Copier le lien dans le presse-papiers',

                    // Right toolbar
                    'tooltip.splat-mode': 'Mode splat ( M )',
                    'tooltip.show-hide': 'Afficher/cacher les splats ( Barre espace )',
                    'tooltip.frame-selection': 'Cadrer la sélection ( F )',
                    'tooltip.camera-reset': 'Réinitialiser la caméra',
                    'tooltip.color-panel': 'Couleurs',
                    'tooltip.view-options': 'Options d\'affichage',

                    // Bottom toolbar
                    'tooltip.undo': 'Annuler ( Ctrl + Z )',
                    'tooltip.redo': 'Rétablir ( Ctrl + Shift + Z )',
                    'tooltip.picker': 'Sélection avec pipette ( R )',
                    'tooltip.polygon': 'Sélection avec polygone ( P )',
                    'tooltip.brush': 'Sélection avec pinceau ( B )',
                    'tooltip.sphere': 'Sélection avec sphère',
                    'tooltip.fly-delete': 'Outil de suppression en vol', // Added
                    'tooltip.fly-select': 'Sélection en vol', // Added tooltip for fly select
                    'tooltip.translate': 'Translation ( 1 )',
                    'tooltip.rotate': 'Rotation ( 2 )',
                    'tooltip.scale': 'Échelle ( 3 )',
                    'tooltip.local-space': 'Espace local gizmo',
                    'tooltip.bound-center': 'Utiliser le centre de la limite',

                    // Viewer Export
                    'export.type': 'Type d\'export',
                    'export.html': 'HTML',
                    'export.package': 'Package ZIP',
                    'export.sh-bands': 'Bandes SH',
                    'export.start-position': 'Position de départ',
                    'export.default': 'Défaut',
                    'export.viewport': 'Vue actuelle',
                    'export.pose-camera': '1ère pose de caméra',
                    'export.fov': 'Champ de vision',
                    'export.background-color': 'Arrière-plan',
                    'export.filename': 'Nom de fichier',

                    // Cursor
                    'cursor.click-to-copy': 'Cliquez pour copier',
                    'cursor.copied': 'Copié!',

                    // Doc
                    'doc.reset': 'REINITIALISER LA SCENE',
                    'doc.unsaved-message': 'Vous avez des modifications non enregistrées. Êtes-vous sûr de vouloir réinitialiser la scène?',
                    'doc.reset-message': 'Êtes-vous sûr de vouloir réinitialiser la scène?',
                    'doc.save-failed': 'ÉCHEC DE L\'ENREGISTREMENT',
                    'doc.load-failed': 'ÉCHEC DU CHARGEMENT',

                    // Publish Settings Dialog
                    'publish.header': 'PARAMETRES DE PUBLICATION',
                    'publish.ok': 'Publier',
                    'publish.cancel': 'Annuler',
                    'publish.title': 'Titre',
                    'publish.description': 'Description',
                    'publish.listed': 'Répertorié',
                    'publish.failed': 'ÉCHEC DE PUBLICATION',
                    'publish.please-try-again': 'Veuillez réessayer plus tard.',
                    'publish.succeeded': 'PUBLICATION RÉUSSIE',
                    'publish.message': 'Utilisez le lien ci-dessous pour accéder à votre scène.',
                    'publish.please-log-in': 'La publication sur PlayCanvas nécessite un compte utilisateur. Veuillez vous connecter et réessayer.',

                    // Video Settings Dialog
                    'video.header': 'PARAMETRES VIDEO',
                    'video.resolution': 'Résolution',
                    'video.frameRate': 'Fréquence d\'image',
                    'video.bitrate': 'Débit binaire',
                    'video.portrait': 'Mode portrait',
                    'video.transparentBg': 'Fond transparent',
                    'video.showDebug': 'Afficher les superpositions de débogage',

                    // Timeline
                    'timeline.prev-key': 'Aller à la clé précédente',
                    'timeline.play': 'Jouer/Arrêter',
                    'timeline.next-key': 'Aller à la clé suivante',
                    'timeline.add-key': 'Ajouter une clé',
                    'timeline.remove-key': 'Supprimer une clé',
                    'timeline.frame-rate': 'Fréquence d\'image',
                    'timeline.total-frames': 'Nombre total de frames'
                }
            },
            ja: {
                translation: {
                    // File menu
                    'file': 'ファイル',
                    'file.new': '新規作成',
                    'file.open': '開く',
                    'file.import': 'インポート...',
                    'file.load-all-data': '全てのPLYデータを読み込む',
                    'file.save': '保存',
                    'file.save-as': '名前を付けて保存',
                    'file.publish': '公開...',
                    'file.export': 'エクスポート',
                    'file.export.compressed-ply': 'Compressed PLY (.ply)',
                    'file.export.splat': 'Splat (.splat)',
                    'file.export.viewer': 'Viewer App...',

                    // Selection menu
                    'select': '選択',
                    'select.all': '全て',
                    'select.none': '選択を解除',
                    'select.invert': '反転',
                    'select.lock': '選択をロック',
                    'select.unlock': 'ロックを解除',
                    'select.delete': '選択を削除',
                    'select.reset': '変更を全てリセット',
                    'select.duplicate': '複製',
                    'select.separate': '分離',

                    // Help menu
                    'help': 'ヘルプ',
                    'help.shortcuts': 'キーボードショートカット',
                    'help.user-guide': 'ユーザーガイド',
                    'help.log-issue': '問題を報告',
                    'help.github-repo': 'GitHubリポジトリ',
                    'help.basics-video': '基本ビデオ',
                    'help.discord': 'Discordサーバー',
                    'help.forum': 'フォーラム',
                    'help.about': 'SuperSplatについて',

                    // Modes
                    'mode.centers': 'センターモード',
                    'mode.rings': 'リングモード',

                    // Scene panel
                    'scene-manager': 'シーンマネージャー',
                    'transform': 'トランスフォーム',
                    'position': '位置',
                    'rotation': '回転',
                    'scale': 'スケール',

                    // Options panel
                    'options': '表示オプション',
                    'options.colors': '色',
                    'options.bg-color': '背景色',
                    'options.selected-color': '選択色',
                    'options.unselected-color': '非選択色',
                    'options.locked-color': 'ロック色',
                    'options.fov': '視野 ( FOV )',
                    'options.sh-bands': '球面調和関数のバンド',
                    'options.centers-size': 'センターサイズ',
                    'options.outline-selection': '選択のアウトライン',
                    'options.show-grid': 'グリッド',
                    'options.show-bound': 'バウンディングボックス',
                    'options.camera-fly-speed': 'カメラの移動速度',

                    // Camera panel
                    'camera': 'カメラポーズ',
                    'camera.add-pose': 'ポーズを追加',
                    'camera.prev-pose': '前のポーズ',
                    'camera.next-pose': '次のポーズ',
                    'camera.play-poses': 'ポーズを再生',
                    'camera.clear-poses': 'ポーズをクリア',

                    // Color panel
                    'colors': '色',
                    'colors.tint': '色合い',
                    'colors.temperature': '温度',
                    'colors.saturation': '彩度',
                    'colors.brightness': '明るさ',
                    'colors.blackPoint': '黒点',
                    'colors.whitePoint': '白点',
                    'colors.transparency': '透明度',
                    'colors.reset': 'リセット',

                    // Data panel
                    'data': 'スプラットの統計',
                    'data.distance': '距離',
                    'data.volume': '体積',
                    'data.surface-area': '表面積',
                    'data.scale-x': 'スケール X',
                    'data.scale-y': 'スケール Y',
                    'data.scale-z': 'スケール Z',
                    'data.red': '赤',
                    'data.green': '緑',
                    'data.blue': '青',
                    'data.opacity': '不透明度',
                    'data.hue': '色相',
                    'data.saturation': '彩度',
                    'data.value': '明度',
                    'data.log-scale': '対数スケール',
                    'data.totals': '合計',
                    'data.totals.splats': 'スプラット数',
                    'data.totals.selected': '選択中',
                    'data.totals.hidden': '非表示',
                    'data.totals.deleted': '削除',

                    // Shortcuts panel
                    'shortcuts.title': 'キーボードショートカット',
                    'shortcuts.tools': 'ツール',
                    'shortcuts.move': '移動',
                    'shortcuts.rotate': '回転',
                    'shortcuts.scale': 'スケール',
                    'shortcuts.rect-selection': '四角形選択',
                    'shortcuts.brush-selection': 'ブラシ選択',
                    'shortcuts.picker-selection': 'ピッカー選択',
                    'shortcuts.brush-size': 'ブラシサイズの増減',
                    'shortcuts.deactivate-tool': 'ツールの非アクティブ化',
                    'shortcuts.selection': '選択',
                    'shortcuts.select-all': '全て選択',
                    'shortcuts.deselect-all': '全て選択解除',
                    'shortcuts.invert-selection': '選択反転',
                    'shortcuts.add-to-selection': '選択追加',
                    'shortcuts.remove-from-selection': '選択解除',
                    'shortcuts.delete-selected-splats': '選択削除',
                    'shortcuts.show': '表示',
                    'shortcuts.hide-selected-splats': '選択非表示',
                    'shortcuts.unhide-all-splats': '全て表示',
                    'shortcuts.toggle-data-panel': 'データパネルの切り替え',
                    'shortcuts.other': 'その他',
                    'shortcuts.select-next-splat': '次のスプラットを選択',
                    'shortcuts.undo': '元に戻す',
                    'shortcuts.redo': 'やり直し',
                    'shortcuts.toggle-splat-overlay': 'スプラットオーバーレイの切り替え',
                    'shortcuts.focus-camera': 'カメラの焦点を合わせる',
                    'shortcuts.toggle-camera-mode': 'カメラモードの切り替え',
                    'shortcuts.toggle-grid': 'グリッドの切り替え',
                    'shortcuts.toggle-gizmo-coordinate-space': 'ギズモ座標空間の切り替え',

                    // Popup
                    'popup.ok': 'OK',
                    'popup.cancel': 'キャンセル',
                    'popup.yes': 'はい',
                    'popup.no': 'いいえ',
                    'popup.error': 'エラー',
                    'popup.error-loading': 'ファイルの読み込みエラー',
                    'popup.drop-files': 'ファイルやフォルダをドロップしてください',
                    'popup.copy-to-clipboard': 'リンクをクリップボードにコピー',

                    // Right toolbar
                    'tooltip.splat-mode': 'スプラットモード ( M )',
                    'tooltip.show-hide': 'スプラットの表示/非表示 ( Space )',
                    'tooltip.frame-selection': '選択をフレームイン ( F )',
                    'tooltip.camera-reset': 'カメラをリセット',
                    'tooltip.color-panel': '色',
                    'tooltip.view-options': '表示オプション',

                    // Bottom toolbar
                    'tooltip.undo': '元に戻す ( Ctrl + Z )',
                    'tooltip.redo': 'やり直し ( Ctrl + Shift + Z )',
                    'tooltip.picker': 'ピッカー選択 ( R )',
                    'tooltip.polygon': 'ポリゴン選択 ( P )',
                    'tooltip.brush': 'ブラシ選択 ( B )',
                    'tooltip.sphere': '球で選択',
                    'tooltip.fly-delete': '飛行削除ツール', // Added
                    'tooltip.fly-select': '飛行選択', // Added tooltip for fly select
                    'tooltip.translate': '移動 ( 1 )',
                    'tooltip.rotate': '回転 ( 2 )',
                    'tooltip.scale': 'スケール ( 3 )',
                    'tooltip.local-space': 'ローカル座標へ切り替え',
                    'tooltip.bound-center': 'バウンディングボックスの中心を使用',

                    // Viewer Export
                    'export.type': 'エクスポートタイプ',
                    'export.html': 'HTML',
                    'export.package': 'ZIPパッケージ',
                    'export.sh-bands': 'SHバンド',
                    'export.start-position': '開始位置',
                    'export.default': 'デフォルト',
                    'export.viewport': '現在のビューポート',
                    'export.pose-camera': '1番目のカメラポーズ',
                    'export.fov': '視野角',
                    'export.background-color': '背景色',
                    'export.filename': 'ファイル名',

                    // Cursor
                    'cursor.click-to-copy': 'クリックしてコピー',
                    'cursor.copied': 'コピーしました！',

                    // Doc
                    'doc.reset': 'シーンをリセット',
                    'doc.unsaved-message': '保存されていない変更があります。シーンをリセットしてもよろしいですか？',
                    'doc.reset-message': 'シーンをリセットしてもよろしいですか？',
                    'doc.save-failed': '保存に失敗',
                    'doc.load-failed': '読み込みに失敗',

                    // Publish Settings Dialog
                    'publish.header': '公開設定',
                    'publish.ok': '公開',
                    'publish.cancel': 'キャンセル',
                    'publish.title': 'タイトル',
                    'publish.description': '説明',
                    'publish.listed': 'リスト',
                    'publish.failed': '公開に失敗',
                    'publish.please-try-again': '後でもう一度お試しください。',
                    'publish.succeeded': '公開に成功',
                    'publish.message': '以下のリンクを使用してシーンにアクセスしてください。',
                    'publish.please-log-in': 'PlayCanvasに公開するにはユーザーアカウントが必要です。ログインしてもう一度お試しください。',

                    // Video Settings Dialog
                    'video.header': 'ビデオ設定',
                    'video.resolution': '解像度',
                    'video.frameRate': 'フレームレート',
                    'video.bitrate': 'ビットレート',
                    'video.portrait': 'ポートレートモード',
                    'video.transparentBg': '透明な背景',
                    'video.showDebug': 'デバッグオーバーレイを表示',

                    // Timeline
                    'timeline.prev-key': '前のキーフレームに移動',
                    'timeline.play': '再生/停止',
                    'timeline.next-key': '次のキーフレームに移動',
                    'timeline.add-key': 'キーフレームを追加',
                    'timeline.remove-key': 'キーフレームを削除',
                    'timeline.frame-rate': 'フレームレート',
                    'timeline.total-frames': '総フレーム数'
                }
            },
            ko: {
                translation: {
                    // File menu
                    'file': '파일',
                    'file.new': '새로 만들기',
                    'file.open': '열기',
                    'file.import': '가져오기...',
                    'file.load-all-data': '모든 PLY 데이터 불러오기',
                    'file.save': '저장',
                    'file.save-as': '다른 이름으로 저장...',
                    'file.publish': '게시...',
                    'file.export': '내보내기',
                    'file.export.compressed-ply': '압축된 PLY',
                    'file.export.splat': 'Splat 파일',
                    'file.export.viewer': '뷰어 앱...',

                    // Selection menu
                    'select': '선택',
                    'select.all': '모두',
                    'select.none': '없음',
                    'select.invert': '반전',
                    'select.lock': '선택 잠금',
                    'select.unlock': '모두 잠금 해제',
                    'select.delete': '선택 삭제',
                    'select.reset': 'Splat 재설정',
                    'select.duplicate': '복제',
                    'select.separate': '분리',

                    // Help menu
                    'help': '도움말',
                    'help.shortcuts': '키보드 단축키',
                    'help.user-guide': '사용자 가이드',
                    'help.log-issue': '문제 보고',
                    'help.github-repo': 'GitHub 저장소',
                    'help.basics-video': '기본 비디오',
                    'help.discord': 'Discord 서버',
                    'help.forum': '포럼',
                    'help.about': 'SuperSplat 정보',

                    // Modes
                    'mode.centers': '센터 모드',
                    'mode.rings': '링 모드',

                    // Scene panel
                    'scene-manager': '장면 관리자',
                    'transform': '변환',
                    'position': '위치',
                    'rotation': '회전',
                    'scale': '크기',

                    // Options panel
                    'options': '보기 옵션',
                    'options.colors': '색상',
                    'options.bg-color': '배경 색상',
                    'options.selected-color': '선택된 색상',
                    'options.unselected-color': '선택되지 않은 색상',
                    'options.locked-color': '잠긴 색상',
                    'options.fov': '시야각',
                    'options.sh-bands': 'SH 밴드',
                    'options.centers-size': '센터 크기',
                    'options.outline-selection': '선택 윤곽선',
                    'options.show-grid': '그리드 표시',
                    'options.show-bound': '경계 표시',
                    'options.camera-fly-speed': '카메라 이동 속도',

                    // Camera panel
                    'camera': '카메라 포즈',
                    'camera.add-pose': '포즈 추가',
                    'camera.prev-pose': '이전 포즈',
                    'camera.next-pose': '다음 포즈',
                    'camera.play-poses': '포즈 재생',
                    'camera.clear-poses': '포즈 지우기',

                    // Color panel
                    'colors': '색상',
                    'colors.tint': '색조',
                    'colors.temperature': '온도',
                    'colors.brightness': '밝기',
                    'colors.blackPoint': '검은 점',
                    'colors.whitePoint': '흰 점',
                    'colors.transparency': '투명도',
                    'colors.reset': '리셋',

                    // Data panel
                    'data': 'SPLAT 데이터',
                    'data.distance': '거리',
                    'data.volume': '부피',
                    'data.surface-area': '표면적',
                    'data.scale-x': '크기 X',
                    'data.scale-y': '크기 Y',
                    'data.scale-z': '크기 Z',
                    'data.red': '빨강',
                    'data.green': '녹색',
                    'data.blue': '파랑',
                    'data.opacity': '불투명도',
                    'data.hue': '색조',
                    'data.saturation': '채도',
                    'data.value': '명도',
                    'data.log-scale': '로그 크기',
                    'data.totals': '합계',
                    'data.totals.splats': 'Splat',
                    'data.totals.selected': '선택',
                    'data.totals.hidden': '숨겨진',
                    'data.totals.deleted': '삭제된',

                    // Shortcuts panel
                    'shortcuts.title': '키보드 단축키',
                    'shortcuts.tools': '도구',
                    'shortcuts.move': '이동',
                    'shortcuts.rotate': '회전',
                    'shortcuts.scale': '크기 조정',
                    'shortcuts.rect-selection': '사각형 선택',
                    'shortcuts.brush-selection': '브러시 선택',
                    'shortcuts.picker-selection': '피커 선택',
                    'shortcuts.brush-size': '브러시 크기 조정',
                    'shortcuts.deactivate-tool': '도구 비활성화',
                    'shortcuts.selection': '선택',
                    'shortcuts.select-all': '모두 선택',
                    'shortcuts.deselect-all': '모두 선택 해제',
                    'shortcuts.invert-selection': '선택 반전',
                    'shortcuts.add-to-selection': '선택 추가',
                    'shortcuts.remove-from-selection': '선택 제거',
                    'shortcuts.delete-selected-splats': '선택된 Splat 삭제',
                    'shortcuts.show': '표시',
                    'shortcuts.hide-selected-splats': '선택된 Splat 숨기기',
                    'shortcuts.unhide-all-splats': '모든 Splat 표시',
                    'shortcuts.toggle-data-panel': '데이터 패널 전환',
                    'shortcuts.other': '기타',
                    'shortcuts.select-next-splat': '다음 Splat 선택',
                    'shortcuts.undo': '실행 취소',
                    'shortcuts.redo': '다시 실행',
                    'shortcuts.toggle-splat-overlay': 'Splat 오버레이 전환',
                    'shortcuts.focus-camera': '현재 선택에 초점 맞추기',
                    'shortcuts.toggle-camera-mode': '카메라 모드 전환',
                    'shortcuts.toggle-grid': '그리드 전환',
                    'shortcuts.toggle-gizmo-coordinate-space': '기즈모 좌표 공간 전환',

                    // Popup
                    'popup.ok': '확인',
                    'popup.cancel': '취소',
                    'popup.yes': '예',
                    'popup.no': '아니요',
                    'popup.error': '오류',
                    'popup.error-loading': '파일 로드 오류',
                    'popup.drop-files': '파일 및 폴더를 드롭하세요',
                    'popup.copy-to-clipboard': '클립 보드에 링크 복사',

                    // Right toolbar
                    'tooltip.splat-mode': 'Splat 모드 ( M )',
                    'tooltip.show-hide': '스플래츠 표시/숨기기 ( Space )',
                    'tooltip.frame-selection': '프레임 선택 ( F )',
                    'tooltip.camera-reset': '카메라 재설정',
                    'tooltip.color-panel': '색상',
                    'tooltip.view-options': '보기 옵션',

                    // Bottom toolbar
                    'tooltip.undo': '실행 취소 ( Ctrl + Z )',
                    'tooltip.redo': '다시 실행 ( Ctrl + Shift + Z )',
                    'tooltip.picker': '피커 선택 ( R )',
                    'tooltip.polygon': '다각형 선택 ( P )',
                    'tooltip.brush': '브러시 선택 ( B )',
                    'tooltip.sphere': '구 선택',
                    'tooltip.fly-delete': '비행 삭제 도구', // Added
                    'tooltip.fly-select': '비행 선택', // Added tooltip for fly select
                    'tooltip.translate': '이동 ( 1 )',
                    'tooltip.rotate': '회전 ( 2 )',
                    'tooltip.scale': '크기 조정 ( 3 )',
                    'tooltip.local-space': '로컬 공간',
                    'tooltip.bound-center': '바운드 중심 사용',

                    // Viewer Export
                    'export.type': '내보내기 유형',
                    'export.html': 'HTML',
                    'export.package': 'ZIP 패키지',
                    'export.sh-bands': 'SH 밴드',
                    'export.start-position': '시작 위치',
                    'export.default': '기본값',
                    'export.viewport': '현재 뷰포트',
                    'export.pose-camera': '1번째 카메라 포즈',
                    'export.fov': '시야각',
                    'export.background-color': '배경색',
                    'export.filename': '파일 이름',

                    // Cursor
                    'cursor.click-to-copy': '클릭하여 복사',
                    'cursor.copied': '복사됨!',

                    // Doc
                    'doc.reset': '장면 재설정',
                    'doc.unsaved-message': '저장되지 않은 변경 사항이 있습니다. 장면을 재설정하시겠습니까?',
                    'doc.reset-message': '장면을 재설정하시겠습니까?',
                    'doc.save-failed': '저장 실패',
                    'doc.load-failed': '로드 실패',

                    // Publish Settings Dialog
                    'publish.header': '게시 설정',
                    'publish.ok': '게시',
                    'publish.cancel': '취소',
                    'publish.title': '제목',
                    'publish.description': '설명',
                    'publish.listed': '목록',
                    'publish.failed': '게시 실패',
                    'publish.please-try-again': '잠시 후 다시 시도하십시오.',
                    'publish.succeeded': '게시 성공',
                    'publish.message': '아래 링크를 사용하여 장면에 액세스하십시오.',
                    'publish.please-log-in': 'PlayCanvas에 게시하려면 사용자 계정이 필요합니다. 로그인하고 다시 시도하십시오.',

                    // Video Settings Dialog
                    'video.header': '비디오 설정',
                    'video.resolution': '해상도',
                    'video.frameRate': '프레임 속도',
                    'video.bitrate': '비트 전송률',
                    'video.portrait': '세로 모드',
                    'video.transparentBg': '투명 배경',
                    'video.showDebug': '디버그 오버레이 표시',

                    // Timeline
                    'timeline.prev-key': '이전 키로 이동',
                    'timeline.play': '재생/정지',
                    'timeline.next-key': '다음 키로 이동',
                    'timeline.add-key': '키 추가',
                    'timeline.remove-key': '키 제거',
                    'timeline.frame-rate': '프레임 속도',
                    'timeline.total-frames': '총 프레임 수'
                }
            },
            'zh-CN': {
                translation: {
                    // File menu
                    'file': '文件',
                    'file.new': '新建',
                    'file.open': '打开',
                    'file.import': '导入...',
                    'file.load-all-data': '加载所有 PLY 数据',
                    'file.save': '保存',
                    'file.save-as': '另存为...',
                    'file.publish': '发布...',
                    'file.export': '导出',
                    'file.export.compressed-ply': '压缩 PLY',
                    'file.export.splat': 'Splat 文件',
                    'file.export.viewer': '查看器应用...',

                    // Selection menu
                    'select': '选择',
                    'select.all': '全部',
                    'select.none': '无',
                    'select.invert': '反选',
                    'select.lock': '锁定选择',
                    'select.unlock': '解锁全部',
                    'select.delete': '删除选择',
                    'select.reset': '重置 Splat',
                    'select.duplicate': '复制',
                    'select.separate': '分离',

                    // Help menu
                    'help': '帮助',
                    'help.shortcuts': '键盘快捷键',
                    'help.user-guide': '用户指南',
                    'help.log-issue': '报告问题',
                    'help.github-repo': 'GitHub 仓库',
                    'help.basics-video': '基础视频',
                    'help.discord': 'Discord 服务器',
                    'help.forum': '论坛',
                    'help.about': '关于 SuperSplat',

                    // Modes
                    'mode.centers': '中心模式',
                    'mode.rings': '环模式',

                    // Scene panel
                    'scene-manager': '场景管理器',
                    'transform': '变换',
                    'position': '位置',
                    'rotation': '旋转',
                    'scale': '缩放',

                    // Options panel
                    'options': '视图选项',
                    'options.colors': '颜色',
                    'options.bg-color': '背景颜色',
                    'options.selected-color': '选中颜色',
                    'options.unselected-color': '未选中颜色',
                    'options.locked-color': '锁定颜色',
                    'options.fov': '视野角',
                    'options.sh-bands': 'SH 带',
                    'options.centers-size': '中心大小',
                    'options.outline-selection': '轮廓选择',
                    'options.show-grid': '显示网格',
                    'options.show-bound': '显示边界',
                    'options.camera-fly-speed': '相机飞行速度',

                    // Camera panel
                    'camera': '相机姿势',
                    'camera.add-pose': '添加姿势',
                    'camera.prev-pose': '上一个姿势',
                    'camera.next-pose': '下一个姿势',
                    'camera.play-poses': '播放姿势',
                    'camera.clear-poses': '清除姿势',

                    // Color panel
                    'colors': '颜色',
                    'colors.tint': '色调',
                    'colors.temperature': '温度',
                    'colors.saturation': '饱和度',
                    'colors.brightness': '亮度',
                    'colors.blackPoint': '黑点',
                    'colors.whitePoint': '白点',
                    'colors.transparency': '透明度',
                    'colors.reset': '重置',

                    // Data panel
                    'data': 'SPLAT 数据',
                    'data.distance': '距离',
                    'data.volume': '体积',
                    'data.surface-area': '表面积',
                    'data.scale-x': '缩放 X',
                    'data.scale-y': '缩放 Y',
                    'data.scale-z': '缩放 Z',
                    'data.red': '红',
                    'data.green': '绿',
                    'data.blue': '蓝',
                    'data.opacity': '不透明度',
                    'data.hue': '色相',
                    'data.saturation': '饱和度',
                    'data.value': '明度',
                    'data.log-scale': '对数缩放',
                    'data.totals': '总计',
                    'data.totals.splats': 'Splat',
                    'data.totals.selected': '选择',
                    'data.totals.hidden': '隐藏',
                    'data.totals.deleted': '删除',

                    // Shortcuts panel
                    'shortcuts.title': '键盘快捷键',
                    'shortcuts.tools': '工具',
                    'shortcuts.move': '移动',
                    'shortcuts.rotate': '旋转',
                    'shortcuts.scale': '缩放',
                    'shortcuts.rect-selection': '矩形选择',
                    'shortcuts.brush-selection': '画笔选择',
                    'shortcuts.picker-selection': '拾取选择',
                    'shortcuts.brush-size': '减小/增大画笔大小',
                    'shortcuts.deactivate-tool': '停用工具',
                    'shortcuts.selection': '选择',
                    'shortcuts.select-all': '全选',
                    'shortcuts.deselect-all': '取消全选',
                    'shortcuts.invert-selection': '反选',
                    'shortcuts.add-to-selection': '添加到选择',
                    'shortcuts.remove-from-selection': '从选择中移除',
                    'shortcuts.delete-selected-splats': '删除选择的 Splat',
                    'shortcuts.show': '显示',
                    'shortcuts.hide-selected-splats': '隐藏选择的 Splat',
                    'shortcuts.unhide-all-splats': '显示全部 Splat',
                    'shortcuts.toggle-data-panel': '切换数据面板',
                    'shortcuts.other': '其他',
                    'shortcuts.select-next-splat': '选择下一个 Splat',
                    'shortcuts.undo': '撤销',
                    'shortcuts.redo': '重做',
                    'shortcuts.toggle-splat-overlay': '切换 Splat 叠加',
                    'shortcuts.focus-camera': '聚焦当前选择',
                    'shortcuts.toggle-camera-mode': '切换相机模式',
                    'shortcuts.toggle-grid': '切换网格',
                    'shortcuts.toggle-gizmo-coordinate-space': '切换 Gizmo 坐标空间',

                    // Popup
                    'popup.ok': '确定',
                    'popup.cancel': '取消',
                    'popup.yes': '是',
                    'popup.no': '否',
                    'popup.error': '错误',
                    'popup.error-loading': '加载文件错误',
                    'popup.drop-files': '请拖放文件和文件夹',
                    'popup.copy-to-clipboard': '复制链接到剪贴板',

                    // Right toolbar
                    'tooltip.splat-mode': 'Splat 模式 ( M )',
                    'tooltip.show-hide': '显示/隐藏 Splats ( Space )',
                    'tooltip.frame-selection': '框选 ( F )',
                    'tooltip.camera-reset': '重置相机',
                    'tooltip.color-panel': '颜色',
                    'tooltip.view-options': '视图选项',

                    // Bottom toolbar
                    'tooltip.undo': '撤销 ( Ctrl + Z )',
                    'tooltip.redo': '重做 ( Ctrl + Shift + Z )',
                    'tooltip.picker': '选择器 ( R )',
                    'tooltip.polygon': '多边形选择 ( P )',
                    'tooltip.brush': '画笔 ( B )',
                    'tooltip.sphere': '球选择',
                    'tooltip.fly-delete': '飞行删除工具', // Added
                    'tooltip.fly-select': '飞行选择', // Added tooltip for fly select
                    'tooltip.translate': '移动 ( 1 )',
                    'tooltip.rotate': '旋转 ( 2 )',
                    'tooltip.scale': '缩放 ( 3 )',
                    'tooltip.local-space': '局部坐标系',
                    'tooltip.bound-center': '使用边界中心',

                    // Viewer Export
                    'export.type': '导出类型',
                    'export.html': 'HTML',
                    'export.package': 'ZIP 包',
                    'export.sh-bands': 'SH 带',
                    'export.start-position': '起始位置',
                    'export.default': '默认',
                    'export.viewport': '当前视口',
                    'export.pose-camera': '第一个相机姿势',
                    'export.fov': '视野角',
                    'export.background-color': '背景颜色',
                    'export.filename': '文件名',

                    // Cursor
                    'cursor.click-to-copy': '点击复制',
                    'cursor.copied': '已复制!',

                    // Doc
                    'doc.reset': '重置场景',
                    'doc.unsaved-message': '有未保存的更改。您确定要重置场景吗？',
                    'doc.reset-message': '您确定要重置场景吗？',
                    'doc.save-failed': '保存失败',
                    'doc.load-failed': '加载失败',

                    // Publish Settings Dialog
                    'publish.header': '发布设置',
                    'publish.ok': '发布',
                    'publish.cancel': '取消',
                    'publish.title': '标题',
                    'publish.description': '描述',
                    'publish.listed': '列出',
                    'publish.failed': '发布失败',
                    'publish.please-try-again': '请稍后再试。',
                    'publish.succeeded': '发布成功',
                    'publish.message': '请使用以下链接访问场景。',
                    'publish.please-log-in': '要在 PlayCanvas 上发布，需要用户帐户。请登录并重试。',

                    // Video Settings Dialog
                    'video.header': '视频设置',
                    'video.resolution': '分辨率',
                    'video.frameRate': '帧率',
                    'video.bitrate': '比特率',
                    'video.portrait': '纵向模式',
                    'video.transparentBg': '透明背景',
                    'video.showDebug': '显示调试覆盖',

                    // Timeline
                    'timeline.prev-key': '上一个关键帧',
                    'timeline.play': '播放/停止',
                    'timeline.next-key': '下一个关键帧',
                    'timeline.add-key': '添加关键帧',
                    'timeline.remove-key': '删除关键帧',
                    'timeline.frame-rate': '帧率',
                    'timeline.total-frames': '总帧数'
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

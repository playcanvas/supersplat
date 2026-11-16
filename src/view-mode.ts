// The editor's two modes. Centers mode marks every gaussian with a dot at its
// centre and selects by centre point; Rings mode outlines every gaussian's
// footprint and selects by footprint. Everything else about the display -
// markers on or off, markers only, x-ray, the markers' colour, the selection's
// tint and outline - is a global switch (see editor.ts)
type ViewMode = 'centers' | 'rings';

const VIEW_MODES: ViewMode[] = ['centers', 'rings'];

export { VIEW_MODES };
export type { ViewMode };

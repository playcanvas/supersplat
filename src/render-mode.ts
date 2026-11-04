// Diagnostic render modes shared by the viewport, the image export dialog and
// the video export dialog. 'normal' is the regular shaded view; the others
// replace the frame with a diagnostic visualisation.
type RenderMode = 'normal' | 'depth' | 'overdraw' | 'normals' | 'alpha' | 'curvature' | 'edge';

const renderModes: readonly RenderMode[] = ['normal', 'depth', 'overdraw', 'normals', 'alpha', 'curvature', 'edge'];

const isRenderMode = (value: unknown): value is RenderMode =>
    typeof value === 'string' && (renderModes as readonly string[]).includes(value);

export { isRenderMode };
export type { RenderMode };

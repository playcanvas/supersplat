// per-splat colour grade, evaluated identically on the GPU (here) and on the
// CPU (ColorGrade.apply in src/color-grade.ts) so the viewport, the data panel
// and the exported file agree. the offset is passed separately because it
// applies to the DC colour only: SH coefficients take the linear part alone
const applyColorGradeWGSL = /* wgsl */`
fn applyColorGrade(color: vec3f, scale: vec3f, offset: f32, saturation: f32) -> vec3f {
    let graded = offset + color * scale;
    let grey = dot(graded, vec3f(0.299, 0.587, 0.114));
    // written as grey + (c - grey) * saturation to match ColorGrade.apply
    // exactly, rather than the algebraically equal mix() form
    return vec3f(grey) + (graded - vec3f(grey)) * saturation;
}`;

export { applyColorGradeWGSL };

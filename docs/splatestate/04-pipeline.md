# 04 — Reconstruction Pipeline & AI Enhancement Plan

## Pipeline overview

Ten stages, each checkpointed to object storage, each with pass/fail criteria and cost telemetry. Stage names match the queue design in [03-architecture.md](./03-architecture.md#processing-queue-design).

```
ingest → frames → quality → sfm → train → cleanup → optimize → package → qa → publish(user)
```

## Stage 1 — Media ingest (`ingest`, CPU)

- Persist original upload (immutable; never modified or deleted by the pipeline).
- Extract metadata: container, codec, resolution, duration, fps, bitrate, GPS/EXIF (stripped from published outputs), camera model hints.
- Detect media type: 360 equirectangular video (2:1 aspect + metadata heuristics + user declaration), flat video, photo set.
- Validate: decodable, duration 1–30 min (video), resolution ≥ 1080p flat / ≥ 4K equirect recommended, photo count 50–1000.
- Generate preview thumbnail + short proxy clip for the dashboard.
- **Fail fast** with actionable copy on invalid input ("This looks like a flat video but the project is set to 360 — change capture type or re-upload").

## Stage 2 — Frame extraction (`frames`, CPU)

- FFmpeg extracts frames at controlled rate: adaptive 1–3 fps targeting **300–600 candidate frames** (hard cap enforced for cost).
- **360 path:** equirectangular frames are reprojected via FFmpeg `v360` into 6–8 virtual pinhole cameras per frame position (yaw ring at eye level + up/down as needed, ~90° FOV, shared intrinsics). Each virtual view becomes an SfM/training image with known relative rotations (used as priors where the SfM backend supports rig constraints).
  - Alternative path (A/B tested in Phase 1): keep equirect frames and use **OpenSfM's spherical camera model** end-to-end, then convert poses for training.
- Low-res proxies (480p) generated for all analysis steps — full-res touched only by SfM/training.
- Frame metadata rows written (`frames` table): index, timestamp, source region (for 360 crops), paths, sharpness/exposure placeholders.

## Stage 3 — Frame quality filtering (`quality`, CPU + light GPU)

The pre-flight gate that protects GPU spend and reconstruction quality. All detectors run on proxies.

| Check | Method (permissive-license) | Action |
|---|---|---|
| Blur / motion blur | Variance of Laplacian + Tenengrad (OpenCV, Apache-2.0) with per-video adaptive threshold | Drop frame if sharpest-in-window alternative exists |
| Over/under-exposure | Histogram clipping %, mean luma bounds | Drop or downweight; feed exposure stats to harmonization |
| Camera shake | Optical-flow magnitude between neighbors (OpenCV) | Drop spikes; if sustained → capture-quality warning |
| Duplicates/redundancy | Perceptual hash + flow < ε | Keep 1 of N; reduces training set bloat |
| Dynamic objects | Lightweight detector (see AI layer) on people/pets/vehicles | Mask (preferred) or drop frame if subject dominates |
| Coverage/gap analysis | Frame timeline + (post-SfM) trajectory gaps | Warnings: "not enough coverage in one area" |

**Gate decision:** if < 60% of candidate frames survive, or coverage heuristics fail, the job stops here with `failure_code=capture_quality`, a plain-language reason, and recapture guidance — **before** any GPU training spend. Credit auto-refunded.

## Stage 4 — SfM / pose estimation (`sfm`, GPU)

Escalation ladder (each step only if the previous fails registration thresholds):

1. **COLMAP** (BSD): GPU SIFT, **sequential matcher** (video ordering prior) + loop detection via vocabulary tree; incremental mapper.
2. **GLOMAP / COLMAP global mapper** (BSD-3): global SfM for speed on large frame sets or when incremental drifts.
3. **OpenSfM** (BSD-2): spherical camera model directly on equirect frames — primary fallback for 360 footage.
4. **HLOC** (Apache-2.0): learned features + matching for low-texture/repetitive interiors (verify each model checkpoint license; SuperPoint weights are non-commercial — use license-safe alternatives such as ALIKED/DISK + LightGlue, each individually verified).

**Pass criteria:** ≥ 70% frames registered, single connected component covering the trajectory, reprojection error within bounds. Partial registration (one connected room cluster) can proceed with a "partial coverage" warning; disconnected components → fail with "the hallway transition failed — re-record moving slowly between rooms."

Outputs: camera poses, sparse points, undistorted images — converted to Nerfstudio dataset format.

## Stage 5 — Gaussian Splat training (`train`, GPU)

- **Nerfstudio Splatfacto** (Apache-2.0) on the **gsplat** backend (Apache-2.0). No Inria rasterizer anywhere in the tree.
- Mask-aware: per-frame masks from the AI layer are passed so masked pixels don't supervise training (people/tripod/mirror regions contribute no gradient).
- Iteration budget by plan tier (e.g., 15k trial / 30k standard); densification caps to bound splat count (~1.5–3 M before optimization).
- Checkpoint every 5k iters to object storage (spot-preemption resume).
- Anti-aliased/absgrad options per gsplat for quality; config frozen per "pipeline version" recorded on the job for reproducibility.
- Export: PLY with training stats (final losses, PSNR on held-out frames, gaussian count).
- Phase 5 candidate: **splatfacto-w** (Apache-2.0) for captures with strong appearance/lighting variation.

## Stage 6 — AI cleanup / compositing (`cleanup`, GPU) {#ai-enhancement-layer}

### The AI enhancement layer — scope and framing

Framed in-product as **"tour cleanup, artifact reduction, visual enhancement, and presentation polish"** — never "perfect reconstruction."

**Ethics rule (enforced, not aspirational):** AI may remove *capture artifacts* (tripod, operator, passers-by, floaters, noise) and *privacy items* (faces, plates, documents, personal photos), and may correct *capture-induced* exposure/color problems. AI must never fake renovations, remove permanent defects or damage, alter room dimensions/geometry, or add content that isn't there. Every automated removal is listed to the user at review time and recorded in the audit log.

### 6a. Dynamic object detection & segmentation

- Detector (permissive: e.g., RT-DETR/RF-DETR-class under Apache-2.0 — verify weights; **not** Ultralytics YOLO, which is AGPL) finds: people, pets, moving cars (through windows), TVs with changing content, photographer/camera/tripod (self-capture signature at nadir in 360 footage), mirrors and problematic reflective surfaces.
- **SAM2** (Apache-2.0 code; verify checkpoint terms) converts detections to precise masks and **propagates them across video frames** (SAM2's video mode is exactly this use case).
- 360 nadir/tripod handling: fixed nadir mask for pole/hand region is applied always — the cheapest, highest-yield cleanup in the whole product.
- Masks stored per frame (`masks` table + PNG in object storage), consumed by training (Stage 5) and privacy review.

### 6b. Privacy detection

- Face detection; license plates (through windows); personal documents/mail; family photos on walls; screens with personal content.
- Output: flagged regions per frame → agent review screen offers blur/remove before publishing; GDPR-relevant categories default to **blur-on** with opt-out. (2D blur baked into training images MVP; 3D-aware removal Phase 5.)

### 6c. Splat-space cleanup (post-training)

- **Floater removal:** statistical outlier pruning (splats with low opacity contribution / far from the sparse-point support / isolated in space), plus visibility-based pruning from training-camera coverage — gsplat pruning utilities + custom pass.
- **Boundary cropping:** auto-compute tight scene bounds from the camera trajectory + point density; crop noisy periphery (through-window "sky garbage", mirror ghosts beyond walls). Manual refinement in the SuperSplat-fork editor.
- **Floor/wall denoise:** detect planar regions from sparse points; flatten/remove stray splats hovering off major planes (conservative thresholds — never re-shape actual geometry).
- **Hole & gap management:** ray-coverage analysis marks weakly-reconstructed zones; small holes → hidden by navigation constraints (viewpoints never enter them); large holes → "recapture recommended for {area}" in the quality report; optional fallback still images for weak rooms in the tour UI. Never pretend a missing room exists.
- **Mirror handling:** masked in training (6a); residual mirror-ghost splats behind wall planes removed by the plane pass.

### 6d. Color & exposure harmonization

- Per-frame exposure normalization before training (stats from Stage 3): gentle gain/curve matching toward the sequence median — bounded corrections only.
- White-balance harmonization across rooms (bounded), preserving genuinely warm/cool lighting character.
- Dark-room lift with a realism ceiling: improve legibility, never "showroom-fake" brightness.
- All corrections logged with before/after params; "original exposure" toggle in review.

### 6e. 3D inpainting (Phase 5, not MVP)

- Candidate: **dfki-av/Inpaint360GS** (Apache-2.0 — verify model/data dependencies) for object-aware 3D inpainting of removed tripods/objects in 360 scenes.
- MVP behavior instead: masking during training (usually leaves a soft plausible fill from other views) + manual cleanup in the editor + honest gaps where fill is impossible.

### 6f. Tour presentation AI (Phase 3–4)

- Room classification per trajectory cluster (kitchen/bath/bedroom via an image classifier on representative frames) → **suggested room labels**.
- Suggested hotspots: viewpoint selection maximizing coverage/aesthetics per room; suggested "best room order" for the guided path (entrance → living → kitchen → bedrooms → bath → outdoor).
- Best starting view: high coverage + high sharpness + doorway-facing heuristic; cover thumbnail rendered from it.
- Listing copy generation (property summary, listing text, social teaser) from room labels + agent-supplied facts — clearly editable drafts, agent owns final text.

### 6g. Quality scoring

Composite score → label: **Excellent / Good / Usable / Needs review / Failed — recapture recommended.**

Inputs: % frames surviving quality gate; SfM registration rate & trajectory connectivity; training PSNR/SSIM on held-out frames; splat count & floater ratio; coverage-hole area; per-room coverage.

Every non-Excellent label ships **reasons in plain language**, e.g.: "Video moved too fast." / "Scene is too dark." / "Too many reflective surfaces." / "Camera path has gaps." / "Not enough coverage in the bedroom." / "The hallway transition failed." Reasons link to the matching capture-guide section.

**Human-in-the-loop:** `Needs review` routes to a manual review queue (internal at MVP; "professional cleanup" paid upsell later).

## Stage 7 — Optimization (`optimize`, CPU)

- **splat-transform** (MIT): PLY → **SOG** compressed format; filtering, quantization, spherical-harmonics band reduction for the mobile variant.
- Two variants: desktop (~≤ 80 MB) and mobile (~≤ 30 MB, reduced splat count/SH bands).
- Render cover image, thumbnail, and social-preview (OG) image.

## Stage 8 — Viewer packaging (`package`, CPU)

- Generate `viewer-config.json`: asset URLs, starting camera, hotspot graph, room labels, navigation bounds (keep-out volumes from hole analysis), branding, CTA config, disclaimer flags.
- Mint public/unlisted URLs (tokenized slugs), embed snippet, QR code.
- Write `splat_assets` + `viewer_configs` rows; stage assets to the tour bucket (public only upon publish).

## Stage 9 — QA (`qa`, CPU + headless GPU)

Automated gate before the tour is offered to the agent:

- File sizes within budget (mobile/desktop variants).
- Headless-browser load test (Playwright + this repo's viewer): time-to-interactive, fps sample, WebGL fallback works.
- Registered-frame %, camera-path sanity, gaussian count within bounds, no giant holes at the starting view.
- Mobile viewport smoke test.
- Result: `ready` (agent notified: "Your tour is ready to review") / `review` (internal queue) / `failed` (reason + recapture guidance).

## Stage 10 — Publish (user action)

Agent approves in the editor → chooses privacy mode (draft / unlisted / public / password / embed-only) → assets flip to CDN-served, analytics activate, lead form goes live. Unpublish reverses within CDN-TTL minutes.

## Pipeline versioning

Every job records `pipeline_version` (git SHA + config hash). Quality regressions are bisectable; reprocessing an old project uses the current pipeline and a new job row, never mutating old artifacts.

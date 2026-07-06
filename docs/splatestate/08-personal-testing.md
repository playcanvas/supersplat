# 08 — Personal-Testing Order (Experimental Repos)

Purpose: a hands-on evaluation sequence for learning the space and benchmarking quality — **on your own test footage, on a research machine, in a quarantined environment**. Several of these repos are research code with non-commercial licenses or non-commercial *dependencies*. None of them may be imported into, vendored into, or linked from the production stack without individual license clearance (see the ban list in [03-architecture.md](./03-architecture.md#explicitly-banned-from-production)).

> ⚠️ **The #1 contamination trap:** many research 3DGS repos — even ones whose own LICENSE file says MIT/Apache — depend on Inria/MPI's `diff-gaussian-rasterization` and `simple-knn` (non-commercial research license) via git submodules or pip requirements. Check the *whole dependency tree*, not just the top-level LICENSE.

## Recommended order

### 1. nerfstudio-project/nerfstudio + gsplat — *the production baseline*

- **License:** Apache-2.0 / Apache-2.0. ✅ Production-safe.
- **Goal:** establish the reference pipeline and quality bar. Run `ns-process-data video` → COLMAP → `ns-train splatfacto` → export PLY. Everything else on this list is compared against this result.
- **Measure:** wall-clock per stage, PSNR on held-out frames, visual quality walking the scene, floater count.

### 2. playcanvas/supersplat — *this repo*

- **License:** MIT. ✅ Production-safe.
- **Goal:** load the Splatfacto export, practice the cleanup workflow (crop bounds, delete floaters, camera poses/timeline), export SOG. This is the manual version of what the Stage-6/7 pipeline will automate — note which manual edits you repeat every time; those are the automation backlog.

### 3. playcanvas/supersplat-viewer

- **License:** MIT. ✅ Production-safe.
- **Goal:** publish the cleaned SOG and test the buyer experience on desktop + a mid-range phone. Measure load time and fps — these numbers calibrate the QA-gate budgets in [04-pipeline.md](./04-pipeline.md).

### 4. inuex35/360-gaussian-splatting

- **License:** ⚠️ **Verify before any use beyond local testing.** Builds on OpenSfM (BSD, fine) but the splatting side derives from the Inria non-commercial codebase — treat as **non-commercial until proven otherwise**.
- **Goal:** benchmark a purpose-built 360 pipeline (OpenSfM spherical model end-to-end) against our FFmpeg-v360-crops + COLMAP approach on the *same* 360 footage. If its poses are meaningfully better, the lesson to take into production is "use OpenSfM's spherical camera model" (BSD-safe) — not this repo's code.

### 5. LeoDarcy/360GS

- **License:** ⚠️ Research code; verify license **and** the rasterizer dependency (very likely Inria non-commercial). Evaluation only.
- **Goal:** study how panoramic-native Gaussian training handles equirect input directly; compare artifacts around poles/nadir vs. the crop-based approach.

### 6. zcq15/PFGS360

- **License:** ⚠️ Research code; verify license and dependency tree. Evaluation only.
- **Goal:** panoramic-focused splatting quality comparison; note any preprocessing/masking tricks (nadir handling, seam handling) worth reimplementing cleanly on gsplat.

### 7. GaussianRoom

- **License:** ⚠️ Research code (typically Inria-derived + SDF components). Evaluation only.
- **Goal:** study geometry-regularized indoor reconstruction — how much do walls/floors improve with SDF/normal priors? Informs the Phase-5 "floor/wall cleanup" roadmap (which we'd implement as plane priors on gsplat, license-safe).

### 8. SplaTAM / MonoGS — *only if testing phone/SLAM-style capture*

- **Licenses:** ⚠️ SplaTAM's own license is permissive-ish (BSD-style) **but** it depends on a depth-enabled fork of the Inria rasterizer → treat as non-commercial. **MonoGS is explicitly research/non-commercial.** Evaluation only, both.
- **Goal:** understand whether SLAM-style dense tracking from casual phone video is materially more robust than COLMAP on the "experimental" phone path. If yes, the production takeaway is to plan a license-safe SLAM/odometry front-end later (or on-device ARKit/ARCore poses in Phase 6) — not to ship these repos.

## Method notes

- Use the **same 2–3 capture datasets** (one easy apartment, one hallway-heavy unit, one hard case with mirrors/glass) across all tools; keep a spreadsheet of: registration rate, train time, VRAM, PSNR, subjective walkthrough score, failure notes.
- Keep experiments in a separate machine/user/venv and a separate git repo; production repos must never import from the experiments repo.
- Anything learned from non-commercial code must be reimplemented from papers/ideas on gsplat/nerfstudio if it's wanted in production ("clean-room the *technique*, never copy the code").

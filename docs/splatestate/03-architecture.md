# 03 — System Architecture, Open-Source Stack, Queue Design, Cloud/GPU Plan

## High-level architecture

```
                                   ┌────────────────────────────────────────────────┐
                                   │                    CDN                         │
                                   │  (tour assets: SOG splats, thumbnails, viewer) │
                                   └───────▲────────────────────────────▲───────────┘
                                           │                            │
┌──────────────┐   HTTPS   ┌───────────────┴───────────┐    ┌───────────┴───────────┐
│ Agent browser │◄────────►│  Web app (Next.js)        │    │ Buyer browser         │
│ (dashboard,   │          │  - dashboard, editor      │    │ (tour viewer,         │
│  editor)      │          │  - SuperSplat fork embed  │    │  supersplat-viewer    │
└──────┬───────┘           └───────────────┬───────────┘    │  fork + lead form)    │
       │ multipart upload                  │ REST/JSON      └───────────┬───────────┘
       │ (presigned URLs)                  ▼                            │ public API
       │                    ┌──────────────────────────┐               │ (tour data,
       └───────────────────►│  API service (FastAPI)   │◄──────────────┘  leads,
                            │  - auth, RBAC            │                  analytics)
┌──────────────────┐        │  - projects/uploads      │
│ Object storage   │◄──────►│  - jobs orchestration    │────► Stripe (billing)
│ (S3-compatible)  │        │  - leads, analytics      │────► Email (SES/Resend)
│ originals/frames/│        └────────┬─────────────────┘
│ masks/splats/    │                 │
│ tours            │        ┌────────▼─────────────────┐
└──────▲───────────┘        │ PostgreSQL 16            │
       │                    │ (system of record)       │
       │                    └────────┬─────────────────┘
       │                             │ job rows (queue)
       │                    ┌────────▼─────────────────┐
       │                    │ Queue: Postgres-backed   │
       │                    │ job table + Valkey       │
       │                    │ pub/sub for progress     │
       │                    └────────┬─────────────────┘
       │                             │ pull (HTTPS, outbound-only)
       │            ┌────────────────┼──────────────────────┐
       │            ▼                ▼                      ▼
       │   ┌────────────────┐ ┌────────────────┐  ┌────────────────┐
       └───┤ CPU workers    │ │ GPU workers    │  │ AI workers     │
           │ ffmpeg ingest, │ │ COLMAP (GPU),  │  │ SAM2 masking,  │
           │ frame extract, │ │ Splatfacto/    │  │ detection,     │
           │ quality filter,│ │ gsplat training│  │ scoring        │
           │ splat-transform│ │                │  │ (GPU, smaller) │
           └────────────────┘ └────────────────┘  └────────────────┘
             (autoscaled container fleet; provider-agnostic Docker images)
```

Reference architecture: **aws-solutions-library-samples/guidance-for-open-source-3d-reconstruction-toolbox-for-gaussian-splats-on-aws** — we follow its shape (media in S3 → orchestrated GPU pipeline with COLMAP/GLOMAP + Nerfstudio/gsplat → web-ready outputs) while keeping the implementation cloud-portable.

## Tech stack (all permissive-license)

| Layer | Choice | License | Why |
|---|---|---|---|
| Web app | Next.js + React + TypeScript | MIT | Dashboard, editor shell, marketing pages, SSR public tour pages (SEO for public listings) |
| Editor | **This repo** — fork of playcanvas/supersplat | MIT | Crop, floater deletion, camera poses, publish prep; already ships timeline/camera-pose tooling reusable for guided tours |
| Buyer viewer | Fork of playcanvas/supersplat-viewer (+ playcanvas/engine) | MIT | Proven SOG playback, mobile support; we add branding/lead overlay |
| API | Python FastAPI + Pydantic + SQLAlchemy | MIT | One language across API and ML pipeline; async; OpenAPI for free |
| DB | PostgreSQL 16 | PostgreSQL (permissive) | System of record + job queue (`FOR UPDATE SKIP LOCKED`) |
| Cache/pub-sub | **Valkey** | BSD-3-Clause | Redis-compatible; chosen over Redis ≥ 7.4 which moved to RSALv2/SSPLv1 (not permissive) |
| Object storage | S3 / any S3-compatible (MinIO for dev, AGPL — dev-only, unmodified use; or SeaweedFS Apache-2.0) | — | Originals, frames, masks, splats, tour bundles |
| Queue/workers | Postgres job table + custom pull workers (Python) | — | See queue design below; avoids Celery+Redis license/ops coupling; Celery (BSD) acceptable alternative |
| Media | FFmpeg — **LGPL build** (disable `--enable-gpl`, no x264/x265; use openh264 BSD or hosted transcode for H.264 encode; decode is fine) | LGPL-2.1 | Frame extraction, v360 reprojection, thumbnails, validation |
| Billing | Stripe SDK | MIT | Subscriptions + credits |
| Email | SES/Resend/Postmark SDK | MIT/Apache | Notifications, leads |
| Infra as code | OpenTofu / Terraform-compatible | MPL-2.0 | Cloud portability |
| Observability | OpenTelemetry + Grafana stack (Grafana/Loki are AGPL — SaaS-internal use is fine, or use managed Grafana Cloud; Prometheus/OTel Apache-2.0) | Apache-2.0 core | Per-stage pipeline telemetry is a day-one requirement |

## Open-source repo usage plan

### Tier 1 — production core

| Repo | License | Role in SplatEstate |
|---|---|---|
| nerfstudio-project/**nerfstudio** | Apache-2.0 | Training framework; `ns-process-data` conventions; **Splatfacto** is the production method |
| nerfstudio-project/**gsplat** | Apache-2.0 | Gaussian rasterization/training backend (the license-safe alternative to Inria's non-commercial rasterizer); also exposes compression/pruning utilities |
| colmap/**colmap** | BSD (New BSD) | Primary SfM: feature extraction, sequential matching (video), sparse reconstruction, undistortion |
| colmap/**glomap** | BSD-3-Clause | Global mapper for faster SfM on large frame sets; if standalone repo is deprecated, use COLMAP's equivalent global mapper |
| mapillary/**OpenSfM** | BSD-2-Clause | Fallback SfM with native **spherical/equirectangular camera model** — key for 360 workflows where perspective-crop + COLMAP underperforms |
| cvg/**Hierarchical-Localization (HLOC)** | Apache-2.0 | Robust learned feature matching (SuperPoint+LightGlue-class, license-check each model) as SfM rescue path for low-texture scenes |
| playcanvas/**supersplat** | MIT | **This repo.** Agent-facing editor: crop bounds, splat deletion, camera poses/timeline, SOG export |
| playcanvas/**supersplat-viewer** | MIT | Buyer-facing tour viewer base |
| playcanvas/**splat-transform** | MIT | CLI conversion/compression: PLY → SOG, filtering, LOD prep, transforms |
| playcanvas/**engine** | MIT | Underlying 3D engine; custom viewer interactions (hotspot nav, guided path, collision-ish constraints) |
| facebookresearch/**sam2** | Apache-2.0 (code) — **verify checkpoint license before prod** | Segmentation for masks: people, tripod/operator, pets, private objects, mirrors |
| **FFmpeg** | LGPL-2.1 (LGPL-safe build) | Ingest, validation, frame extraction, v360 equirect→perspective, thumbnails |

### Tier 2 — reference & roadmap (not in MVP runtime)

| Repo | License | Planned use |
|---|---|---|
| aws-solutions-library-samples/guidance-for-open-source-3d-reconstruction-toolbox-for-gaussian-splats-on-aws | (sample code — review terms) | Architecture reference only |
| ArthurBrussee/**brush** | Apache-2.0 | Future WebGPU/on-device training path (Phase 6 capture apps) |
| KevinXu02/**splatfacto-w** | Apache-2.0 | "In the wild" appearance/lighting variation handling — Phase 5 candidate for mixed-lighting captures |
| nerficg-project/**faster-gaussian-splatting** | Apache-2.0 | Training speed optimization candidate |
| inuex35/**splat_one** | Apache-2.0 | GUI workflow inspiration only |
| wanmeihuali/**taichi_3d_gaussian_splatting** | Apache-2.0 | Alternative implementation for testing/learning |
| joeyan/**gaussian_splatting** | MIT | Reference implementation; prefer gsplat in prod |
| AndrewBoessen/**3DGS** | MIT | Minimal C++/CUDA learning reference |
| nvpro-samples/**vk_gaussian_splatting** | Apache-2.0 | Native/Vulkan viewer reference (future native apps) |
| InternLandMark/**FlashGS** | MIT | Future large-scene rendering optimization |
| 3dv-casia/**MGSfM** | BSD-3-Clause | Future multi-camera/360-rig reconstruction |
| facebookresearch/**map-anything** | Apache-2.0 variant — **verify exact terms** | Future metric depth/pose assistance |
| dfki-av/**Inpaint360GS** | Apache-2.0 — **verify model/data deps** | Phase 5: object-aware 3D inpainting for 360 scenes |
| U2Net-style background removal (permissive forks only) | verify per-repo | Optional masking preprocessing |

### Explicitly banned from production

- `graphdeco-inria/gaussian-splatting` and its `diff-gaussian-rasterization` / `simple-knn` submodules (Inria/MPI **non-commercial research license**) — including *any transitive dependency* that vendors them. This is the single most common license contamination vector in the splat ecosystem: many research repos (MonoGS, GaussianRoom, many "XX-GS" papers) depend on it.
- Any repo with no LICENSE file.
- Forks of non-commercial research repos regardless of what the fork's LICENSE claims.
- AGPL components in shipped/linked code paths (internal ops tooling exempted case-by-case).
- Apple sample-code derivatives unless terms are individually reviewed.
- Model weights whose terms are unclear, even when repo code is permissive (weights and code are licensed separately — check both).

### License inventory (process)

- `THIRD_PARTY_LICENSES.md` generated in CI (e.g., pip-licenses + license-checker) on every build; build **fails** on GPL/AGPL/unknown/noncommercial in production dependency trees.
- Every new dependency requires a PR checklist entry: license of code, license of any weights/data, licenses of transitive deps.
- Quarantine rule: experimental repos ([08-personal-testing.md](./08-personal-testing.md)) live only in a separate research environment/repo, never imported by production code.
- Full legal review of the inventory before public launch.

## Processing queue design

**Choice: Postgres-backed job queue with pull workers.** No message broker to operate; jobs are transactional with the rest of the system of record; `SELECT ... FOR UPDATE SKIP LOCKED` gives safe concurrent dequeue. Valkey is used only for ephemeral progress pub/sub to the status UI.

### Job model

- A `processing_job` row per pipeline run, plus child `job_stages` (see [05-database-schema.md](./05-database-schema.md)). Stages: `ingest → frames → quality → sfm → train → cleanup → optimize → package → qa`.
- Workers are **stage-typed**: `cpu` (ingest/frames/quality/optimize/package), `gpu-train` (sfm/train), `gpu-ai` (masking/cleanup/scoring). A job flows across worker types; the queue matches `stage → required worker class`.
- Dequeue: worker polls `POST /internal/jobs/claim {worker_class, capabilities}` → API runs `UPDATE ... WHERE id = (SELECT id FROM processing_jobs WHERE status='queued' AND worker_class=$1 ORDER BY priority DESC, created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING ...`.
- **Pull model, outbound-only workers**: GPU boxes on RunPod/Lambda need no inbound ports; they claim work, download inputs via presigned URLs, upload outputs via presigned URLs, and POST progress/heartbeats. This is what makes the fleet provider-agnostic.

### Reliability semantics

- **Heartbeats**: worker heartbeats every 30 s; a job with no heartbeat for 5 min is marked `stalled` and re-queued (attempt count +1).
- **Retries**: infrastructure failures (OOM, spot preemption, download error) auto-retry up to 3× with backoff, resuming from the last completed stage (stage outputs are persisted to object storage as checkpoints). Content failures (SfM can't register frames) do **not** retry — they fail fast with a `failure_code` + human reason.
- **Idempotency**: every stage writes to a deterministic object-storage prefix (`projects/{id}/jobs/{job_id}/{stage}/`); re-running a stage overwrites cleanly.
- **Priority**: integer priority — Agency/priority-credit jobs > Pro > Starter > trial. Per-plan concurrent-job caps prevent queue monopolization.
- **Cancellation**: user cancel sets `cancel_requested`; workers check between sub-steps and at checkpoint boundaries.
- **Progress**: workers POST `{stage, pct, message}`; API relays via Valkey pub/sub → SSE/WebSocket to the status page; also persisted to `processing_logs`.
- **Dead-letter**: jobs exceeding max attempts land in `failed` with full logs; visible in admin console X1/X2 with one-click retry.
- **Cost telemetry**: each stage records worker class, GPU type, wall-clock seconds, and estimated cost — aggregated per job/plan for unit-economics tracking (PRD risk #2).

## Cloud/GPU infrastructure plan

### Principles

1. **Provider-agnostic GPU fleet.** Workers are plain Docker images (CUDA base) that pull jobs over HTTPS. They run identically on RunPod, Lambda Cloud, CoreWeave, Vast.ai (with vetting), or AWS g5/g6.
2. **Control plane on boring managed infra.** API + Postgres + web app on a mainstream cloud (e.g., AWS: ECS/Fargate + RDS + S3 + CloudFront; or Hetzner + managed PG for cost). The control plane never needs a GPU.
3. **Egress is a first-class cost.** Tour assets served via CDN with long cache lifetimes; SOG compression keeps per-tour delivery ~20–40 MB.

### GPU sizing (MVP)

| Workload | GPU | Est. time per tour (apartment, ~300–600 frames) |
|---|---|---|
| COLMAP (GPU SIFT + matching) | L4 / RTX 4090 / A10G class, 24 GB | 10–30 min sequential matcher |
| Splatfacto training (30k iters) | same | 20–45 min |
| SAM2 masking + detection | same (or smaller) | 5–15 min |
| CPU stages (ffmpeg, transform, package) | CPU-only nodes | 5–10 min |

Working planning number: **~1–1.5 GPU-hours per tour**, ≈ $0.5–1.5 on spot/community pricing, $2–5 on on-demand cloud — comfortably inside the ≤ 20%-of-revenue guardrail at €12–15/credit.

### Scaling model

- **Phase 1:** one rented GPU box, jobs run manually.
- **Phase 2 (MVP):** 1–2 always-on GPU workers on RunPod/Lambda + autoscaler script that watches queue depth and starts/stops instances via provider API. Spot/community instances with stage checkpointing (retry semantics above absorb preemption).
- **Phase 4+:** scheduled capacity for business hours per market; burst to on-demand; optionally AWS Batch/ECS-GPU if consolidating onto AWS (per the AWS guidance sample).

### Environments

- `dev` (docker-compose: Postgres, Valkey, MinIO, one local worker; small test datasets)
- `staging` (full pipeline on 1 GPU, synthetic + fixture properties, license scan gate)
- `prod` (as above; separate storage buckets, keys, and DB; no research code)

### Storage layout (S3)

```
s3://splatestate-media/                # private bucket, signed URLs only
  agencies/{agency_id}/branding/...
  projects/{project_id}/
    uploads/{upload_id}/original.*     # immutable original
    jobs/{job_id}/
      frames/{frame_id}.jpg            # extracted frames
      frames_lowres/...                # analysis proxies
      masks/{frame_id}.png
      sfm/{colmap|opensfm}/...         # poses, sparse model
      train/checkpoints/...            # resumable checkpoints (TTL 7d)
      splat/raw.ply                    # training export
      splat/cleaned.ply
s3://splatestate-tours/                # CDN-fronted; public objects only for published tours
  tours/{tour_slug}/
    scene.sog / scene-mobile.sog
    viewer-config.json                 # served via API for private tours
    cover.jpg / thumb.jpg
```

Private tours are never in the public bucket: viewer fetches short-lived signed URLs through the API after access check (unlisted-token / password / auth).

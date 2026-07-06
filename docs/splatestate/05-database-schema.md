# 05 — Database Schema (PostgreSQL 16)

Conventions: UUID v7 primary keys (time-ordered); `timestamptz` everywhere; `created_at`/`updated_at` on all tables (triggers omitted below for brevity); soft delete via `deleted_at` where noted; enums as Postgres types; JSONB for flexible configs with app-level validation.

```sql
-- ============================================================ enums
CREATE TYPE member_role       AS ENUM ('owner','agent','editor');
CREATE TYPE capture_type      AS ENUM ('video_360','video_flat','photo_set');
CREATE TYPE project_status    AS ENUM ('draft','uploading','processing','ready','review','failed','published','archived');
CREATE TYPE upload_status     AS ENUM ('initialized','uploading','completed','aborted','validated','invalid');
CREATE TYPE job_status        AS ENUM ('queued','claimed','running','succeeded','failed','canceled','stalled');
CREATE TYPE job_stage         AS ENUM ('ingest','frames','quality','sfm','train','cleanup','optimize','package','qa');
CREATE TYPE worker_class      AS ENUM ('cpu','gpu_train','gpu_ai');
CREATE TYPE mask_kind         AS ENUM ('person','pet','vehicle','tripod_operator','mirror_reflective','face','license_plate','document','personal_photo','screen','clutter','other');
CREATE TYPE asset_kind        AS ENUM ('splat_raw','splat_cleaned','sog_desktop','sog_mobile','cover_image','thumbnail','og_image');
CREATE TYPE privacy_mode      AS ENUM ('private','unlisted','public','password','embed_only');
CREATE TYPE quality_label     AS ENUM ('excellent','good','usable','needs_review','failed');
CREATE TYPE lead_status       AS ENUM ('new','contacted','qualified','closed','spam');
CREATE TYPE plan_code         AS ENUM ('trial','starter','pro','agency');
CREATE TYPE sub_status        AS ENUM ('trialing','active','past_due','canceled','paused');
CREATE TYPE credit_reason     AS ENUM ('plan_grant','purchase','job_consume','failure_refund','admin_adjust','expiry');
CREATE TYPE analytics_kind    AS ENUM ('tour_view','room_view','hotspot_click','cta_click','lead_submit','share_click','embed_load');

-- ============================================================ 1. users
CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  email            citext NOT NULL UNIQUE,
  password_hash    text,                          -- null for OAuth-only accounts
  oauth_provider   text,                          -- 'google' | null
  oauth_subject    text,
  full_name        text NOT NULL,
  phone            text,
  avatar_url       text,
  email_verified_at timestamptz,
  is_staff_admin   boolean NOT NULL DEFAULT false, -- internal admin; never settable via public API
  tos_accepted_at  timestamptz,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  training_opt_in  boolean NOT NULL DEFAULT false, -- explicit opt-in for ML use of uploads
  last_login_at    timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (oauth_provider, oauth_subject)
);

-- ============================================================ 2. agencies
CREATE TABLE agencies (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  name             text NOT NULL,
  slug             citext NOT NULL UNIQUE,        -- public URL: /a/{slug}
  logo_url         text,
  brand_color      text,                          -- hex
  website_url      text,
  contact_email    citext,
  contact_phone    text,
  whatsapp_number  text,
  country          text,                          -- ISO 3166-1
  locale           text NOT NULL DEFAULT 'en',
  white_label_domain text UNIQUE,                 -- upsell
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================ 3. agency_members
CREATE TABLE agency_members (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  agency_id    uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         member_role NOT NULL DEFAULT 'agent',
  invited_by   uuid REFERENCES users(id),
  invited_email citext,                           -- pending invite before user exists
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, user_id)
);
CREATE INDEX idx_members_user   ON agency_members (user_id);
CREATE INDEX idx_members_agency ON agency_members (agency_id, role);

-- ============================================================ 4. projects
CREATE TABLE projects (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  agency_id        uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  created_by       uuid NOT NULL REFERENCES users(id),
  title            text NOT NULL,
  status           project_status NOT NULL DEFAULT 'draft',
  capture_type     capture_type,
  address          text,
  city             text,
  country          text,
  price_amount     numeric(14,2),
  price_currency   text,                          -- ISO 4217
  listing_url      text,
  description      text,
  cover_asset_id   uuid,                          -- FK added after splat_assets
  active_job_id    uuid,                          -- FK added after processing_jobs
  published_at     timestamptz,
  archived_at      timestamptz,
  deleted_at       timestamptz,                   -- soft delete; hard purge job follows
  purge_after      timestamptz,                   -- GDPR grace deadline
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_agency  ON projects (agency_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_creator ON projects (created_by)         WHERE deleted_at IS NULL;

-- ============================================================ 5. uploads
CREATE TABLE uploads (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by      uuid NOT NULL REFERENCES users(id),
  status           upload_status NOT NULL DEFAULT 'initialized',
  capture_type     capture_type NOT NULL,
  storage_key      text NOT NULL,                 -- s3 key of original
  s3_upload_id     text,                          -- multipart upload id
  filename         text NOT NULL,
  content_type     text,
  size_bytes       bigint,
  parts_total      integer,
  parts_completed  integer NOT NULL DEFAULT 0,
  checksum_sha256  text,
  media_meta       jsonb,                         -- codec, duration, resolution, fps, is_equirect...
  validation_errors jsonb,                        -- [{code, message}]
  consent_confirmed boolean NOT NULL DEFAULT false, -- "I have permission to publish this media"
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_uploads_project ON uploads (project_id, status);

-- ============================================================ 6. frames
CREATE TABLE frames (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  job_id           uuid NOT NULL,                 -- FK added after processing_jobs
  upload_id        uuid NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  frame_index      integer NOT NULL,
  source_time_ms   integer,                       -- position in source video
  view_yaw_deg     real,                          -- for 360→pinhole crops
  view_pitch_deg   real,
  storage_key      text NOT NULL,
  lowres_key       text,
  width            integer,
  height           integer,
  sharpness        real,                          -- variance of Laplacian
  exposure_score   real,                          -- 0..1 (0=clipped)
  shake_score      real,
  is_duplicate_of  uuid REFERENCES frames(id),
  excluded         boolean NOT NULL DEFAULT false,
  exclusion_reason text,                          -- 'blur','overexposed','duplicate','dynamic_object',...
  registered       boolean,                       -- SfM registered this frame
  pose             jsonb,                         -- {q:[...], t:[...]} after SfM
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_frames_job_ix ON frames (job_id, frame_index, view_yaw_deg, view_pitch_deg);
CREATE INDEX idx_frames_job_included  ON frames (job_id) WHERE excluded = false;

-- ============================================================ 7. masks
CREATE TABLE masks (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  frame_id     uuid NOT NULL REFERENCES frames(id) ON DELETE CASCADE,
  kind         mask_kind NOT NULL,
  storage_key  text NOT NULL,                     -- PNG mask in object storage
  bbox         jsonb,                             -- [x,y,w,h] normalized
  confidence   real,
  source       text NOT NULL,                     -- 'sam2','detector','nadir_fixed','manual'
  privacy_flag boolean NOT NULL DEFAULT false,    -- surfaced in privacy review
  applied_in_training boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_masks_frame   ON masks (frame_id);
CREATE INDEX idx_masks_privacy ON masks (privacy_flag) WHERE privacy_flag;

-- ============================================================ 8. processing_jobs
CREATE TABLE processing_jobs (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  upload_id        uuid NOT NULL REFERENCES uploads(id),
  requested_by     uuid NOT NULL REFERENCES users(id),
  status           job_status NOT NULL DEFAULT 'queued',
  current_stage    job_stage,
  worker_class     worker_class NOT NULL DEFAULT 'cpu', -- class needed for current stage
  priority         integer NOT NULL DEFAULT 0,
  attempt          integer NOT NULL DEFAULT 1,
  max_attempts     integer NOT NULL DEFAULT 3,
  progress_pct     real NOT NULL DEFAULT 0,
  progress_message text,
  pipeline_version text NOT NULL,                 -- git SHA + config hash
  worker_id        text,                          -- claiming worker instance
  claimed_at       timestamptz,
  heartbeat_at     timestamptz,
  cancel_requested boolean NOT NULL DEFAULT false,
  failure_code     text,                          -- machine taxonomy: 'capture_quality','sfm_registration',...
  failure_reason   text,                          -- human-readable, shown to user
  quality_label    quality_label,
  quality_reasons  jsonb,                         -- ["Video moved too fast", ...]
  stage_timings    jsonb,                         -- {stage: seconds}
  cost_estimate_usd numeric(8,4),
  gpu_type         text,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- queue dequeue index (FOR UPDATE SKIP LOCKED scan)
CREATE INDEX idx_jobs_queue   ON processing_jobs (worker_class, priority DESC, created_at)
  WHERE status = 'queued';
CREATE INDEX idx_jobs_project ON processing_jobs (project_id, created_at DESC);
CREATE INDEX idx_jobs_stalled ON processing_jobs (heartbeat_at) WHERE status IN ('claimed','running');
CREATE INDEX idx_jobs_failed  ON processing_jobs (failure_code, created_at DESC) WHERE status = 'failed';

ALTER TABLE frames   ADD CONSTRAINT fk_frames_job  FOREIGN KEY (job_id)        REFERENCES processing_jobs(id) ON DELETE CASCADE;
ALTER TABLE projects ADD CONSTRAINT fk_active_job  FOREIGN KEY (active_job_id) REFERENCES processing_jobs(id) ON DELETE SET NULL;

-- ============================================================ 9. processing_logs
CREATE TABLE processing_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id       uuid NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
  stage        job_stage,
  level        text NOT NULL DEFAULT 'info',      -- debug|info|warn|error
  message      text NOT NULL,
  data         jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_logs_job ON processing_logs (job_id, id);
-- partition by month at scale; ship to Loki/S3 for long retention

-- ============================================================ 10. splat_assets
CREATE TABLE splat_assets (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id         uuid NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
  kind           asset_kind NOT NULL,
  storage_key    text NOT NULL,
  cdn_url        text,                            -- set on publish
  size_bytes     bigint NOT NULL,
  checksum_sha256 text,
  gaussian_count integer,
  sh_bands       smallint,
  meta           jsonb,                           -- psnr, bounds, format version...
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_assets_project ON splat_assets (project_id, kind);
ALTER TABLE projects ADD CONSTRAINT fk_cover_asset FOREIGN KEY (cover_asset_id) REFERENCES splat_assets(id) ON DELETE SET NULL;

-- ============================================================ 11. viewer_configs
CREATE TABLE viewer_configs (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id       uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  privacy_mode     privacy_mode NOT NULL DEFAULT 'private',
  public_slug      citext UNIQUE,                 -- /t/{slug}
  unlisted_token   text UNIQUE,                   -- high-entropy token for unlisted links
  password_hash    text,                          -- for password mode
  starting_view    jsonb,                         -- {position, rotation, fov}
  nav_bounds       jsonb,                         -- keep-out volumes, floor height
  guided_path      jsonb,                         -- ordered hotspot ids + timings
  branding         jsonb,                         -- {logo, color, agentName, photo, phone, whatsapp}
  cta_config       jsonb,                         -- buttons, lead-form fields toggles
  details_panel    jsonb,                         -- price/address/description visibility
  watermark        boolean NOT NULL DEFAULT false,
  embed_allowed_origins text[],
  disclaimer_shown boolean NOT NULL DEFAULT true,
  published_version integer NOT NULL DEFAULT 0,   -- bump on publish; cache-bust key
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================ 12. hotspots
CREATE TABLE hotspots (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind           text NOT NULL DEFAULT 'nav',     -- 'nav' | 'room_label' | 'info'
  label          text NOT NULL,                   -- "Kitchen", "Master bedroom"
  position       jsonb NOT NULL,                  -- [x,y,z] in scene space
  camera_pose    jsonb,                           -- viewpoint to fly to {position, rotation}
  sort_order     integer NOT NULL DEFAULT 0,      -- guided-path ordering
  ai_suggested   boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hotspots_project ON hotspots (project_id, sort_order);

-- ============================================================ 13. leads
CREATE TABLE leads (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agency_id         uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE, -- denormalized for inbox queries
  status            lead_status NOT NULL DEFAULT 'new',
  name              text NOT NULL,
  email             citext,
  phone             text,
  message           text,
  preferred_contact text,                         -- 'email'|'phone'|'whatsapp'
  viewing_at        timestamptz,                  -- desired viewing date/time (optional)
  source            text,                         -- 'tour'|'embed'|'agency_page'
  referrer          text,
  device_type       text,
  ip_hash           text,                         -- salted hash, spam control; raw IP never stored
  consent_at        timestamptz NOT NULL,         -- lead-form privacy consent
  handled_by        uuid REFERENCES users(id),
  handled_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_agency  ON leads (agency_id, status, created_at DESC);
CREATE INDEX idx_leads_project ON leads (project_id, created_at DESC);

-- ============================================================ 14. analytics_events
CREATE TABLE analytics_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind         analytics_kind NOT NULL,
  session_id   text NOT NULL,                     -- anonymous, rotating, cookieless
  hotspot_id   uuid REFERENCES hotspots(id) ON DELETE SET NULL,
  duration_ms  integer,                           -- for view-time events
  device_type  text,                              -- 'desktop'|'mobile'|'tablet'
  country      text,                              -- from IP at edge; IP not stored
  city         text,                              -- coarse, privacy-safe
  referrer     text,
  meta         jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);                 -- monthly partitions
CREATE INDEX idx_events_project ON analytics_events (project_id, kind, created_at);
-- nightly rollup into project_analytics_daily materialized summaries

-- ============================================================ 15. billing_plans
CREATE TABLE billing_plans (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  code             plan_code NOT NULL UNIQUE,
  name             text NOT NULL,
  stripe_price_id  text,
  monthly_price_cents integer NOT NULL,
  currency         text NOT NULL DEFAULT 'EUR',
  tours_per_month  integer NOT NULL,               -- credit grant per cycle
  seats            integer NOT NULL DEFAULT 1,
  watermark        boolean NOT NULL DEFAULT false,
  priority         integer NOT NULL DEFAULT 0,     -- queue priority
  storage_gb       integer NOT NULL,
  features         jsonb,                          -- {branding: true, analytics: 'full', ...}
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================ 16. subscriptions
CREATE TABLE subscriptions (
  id                    uuid PRIMARY KEY DEFAULT uuidv7(),
  agency_id             uuid NOT NULL UNIQUE REFERENCES agencies(id) ON DELETE CASCADE,
  plan_id               uuid NOT NULL REFERENCES billing_plans(id),
  status                sub_status NOT NULL,
  stripe_customer_id    text UNIQUE,
  stripe_subscription_id text UNIQUE,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subs_status ON subscriptions (status, current_period_end);

-- ============================================================ 17. processing_credits (ledger)
CREATE TABLE processing_credits (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  agency_id    uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  delta        integer NOT NULL,                  -- +grant / -consume
  reason       credit_reason NOT NULL,
  job_id       uuid REFERENCES processing_jobs(id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  expires_at   timestamptz,                       -- plan-grant credits expire at period end
  note         text,
  created_by   uuid REFERENCES users(id),         -- for admin_adjust
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_credits_agency ON processing_credits (agency_id, created_at DESC);
-- balance = SUM(delta) over non-expired rows; enforced non-negative in app txn:
--   consume inserts a -1 row inside the same transaction that enqueues the job,
--   guarded by SELECT ... FOR UPDATE on a per-agency advisory lock.

-- ============================================================ 18. audit_logs
CREATE TABLE audit_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     uuid REFERENCES users(id),          -- null for system actions
  actor_type   text NOT NULL DEFAULT 'user',       -- 'user'|'system'|'admin'
  agency_id    uuid REFERENCES agencies(id) ON DELETE SET NULL,
  action       text NOT NULL,                      -- 'project.publish','project.delete','member.role_change',
                                                   -- 'ai.removal_applied','admin.impersonate','data.export',...
  target_type  text,                               -- 'project'|'user'|'lead'|...
  target_id    uuid,
  data         jsonb,                              -- before/after, AI edit list, etc.
  ip_hash      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_agency ON audit_logs (agency_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_logs (target_type, target_id, created_at DESC);
```

## Relationship summary

```
users ──< agency_members >── agencies ──1:1── subscriptions >── billing_plans
                                │  ──< processing_credits (ledger)
                                │  ──< leads (denormalized agency_id)
                                └──< projects ──< uploads ──< processing_jobs ──< processing_logs
                                        │                          │ ──< frames ──< masks
                                        │                          └──< splat_assets
                                        │──1:1── viewer_configs
                                        │──< hotspots
                                        │──< leads
                                        └──< analytics_events (partitioned)
audit_logs — cross-cutting, references actors/targets loosely
```

## Design notes

- **Queue in the DB:** `idx_jobs_queue` is the partial index behind the `FOR UPDATE SKIP LOCKED` dequeue; queue health = one query.
- **Credits as an append-only ledger** (never a mutable balance column): auditability, easy refunds (`failure_refund` rows), Stripe reconciliation.
- **Privacy by construction:** raw IPs never stored (salted `ip_hash` only); analytics are cookieless session-scoped; `training_opt_in` defaults false; `purge_after` drives the hard-delete job that removes DB rows *and* object-storage prefixes.
- **Denormalizations:** `leads.agency_id` (inbox queries), `projects.active_job_id` (dashboard status chip) — both maintained in the owning transaction.
- **Scale-outs planned, not built:** partition `analytics_events` monthly from day one; partition `processing_logs` when > ~50 M rows; move analytics rollups to materialized daily summaries.

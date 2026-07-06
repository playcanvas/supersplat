# 06 — API Plan

REST/JSON, versioned under `/api/v1`. Auth: short-lived JWT access token + rotating refresh token (httpOnly cookies for the web app; Bearer for future API customers). All non-public endpoints enforce agency membership + role (RBAC column notes below). OpenAPI spec generated from FastAPI. Errors: RFC 7807 problem+json with stable `code` fields. Rate limits at the edge; strict limits on public endpoints (lead submit, analytics ingest).

## Authentication

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/auth/register` | public | email, password, full_name, tos_accept; sends verification email |
| POST | `/auth/login` | public | email+password → tokens; lockout on brute force |
| POST | `/auth/oauth/google` | public | OAuth code exchange |
| POST | `/auth/logout` | any | revokes refresh token |
| POST | `/auth/refresh` | any | rotate tokens |
| POST | `/auth/password/forgot` | public | always-200 (no user enumeration) |
| POST | `/auth/password/reset` | public | token + new password |
| POST | `/auth/verify-email` | public | token |

## Agency

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/agency` | member | current user's agency + own role |
| PATCH | `/agency` | owner | name, contacts, locale, slug |
| POST | `/agency/logo` | owner | presigned upload → validated (type/size) → set |
| GET | `/agency/members` | member | list with roles |
| POST | `/agency/members/invite` | owner | email + role; idempotent per email |
| DELETE | `/agency/members/{member_id}` | owner | cannot remove last owner |
| PATCH | `/agency/members/{member_id}` | owner | update role; cannot demote last owner |
| POST | `/agency/invites/{token}/accept` | authed user | join agency |

## Projects

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/projects` | agent+ | title, capture_type, address… |
| GET | `/projects` | member | own (agent) / all (owner); filter by status; cursor pagination |
| GET | `/projects/{id}` | project access | full detail incl. active job summary |
| PATCH | `/projects/{id}` | agent(own)/editor/owner | metadata fields |
| POST | `/projects/{id}/archive` | agent(own)/owner | |
| DELETE | `/projects/{id}` | agent(own)/owner | soft delete + schedules hard purge; response lists exactly what will be destroyed |

## Uploads (resumable multipart)

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/projects/{id}/uploads` | agent+ | init: filename, size, content_type, capture_type, consent_confirmed → upload_id + part size |
| POST | `/uploads/{id}/parts/{n}` | uploader | returns presigned PUT URL for part n (client uploads direct to S3) |
| POST | `/uploads/{id}/complete` | uploader | part ETags → finalize; triggers async validation |
| POST | `/uploads/{id}/cancel` | uploader | aborts multipart, cleans parts |
| GET | `/uploads/{id}` | project access | status, parts_completed, validation result / errors |

## Processing

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/projects/{id}/process` | agent+ | consumes 1 credit (transactional with enqueue); optional `{priority: true}` (priority credit); 402 if no credits |
| GET | `/projects/{id}/jobs` | project access | job history |
| GET | `/jobs/{id}` | project access | status, stage, progress_pct, message, quality label+reasons, failure info |
| GET | `/jobs/{id}/events` | project access | SSE stream of live progress |
| GET | `/jobs/{id}/logs` | project access | user-safe log excerpt (full logs admin-only) |
| POST | `/jobs/{id}/retry` | agent+ | only for retryable failure codes; no extra credit |
| POST | `/jobs/{id}/cancel` | agent+ | sets cancel_requested |

### Internal (worker-facing, mTLS/token-authed, separate listener)

| Method | Path | Notes |
|---|---|---|
| POST | `/internal/jobs/claim` | `{worker_class, worker_id, capabilities}` → job payload + presigned I/O URLs, or 204 |
| POST | `/internal/jobs/{id}/heartbeat` | liveness + optional progress |
| POST | `/internal/jobs/{id}/progress` | `{stage, pct, message}` → fan-out to SSE |
| POST | `/internal/jobs/{id}/stage-complete` | stage outputs manifest; advances stage / re-queues to next worker_class |
| POST | `/internal/jobs/{id}/fail` | `{failure_code, failure_reason, retryable}` |
| POST | `/internal/jobs/{id}/complete` | final artifacts manifest, quality score, cost telemetry |

## Editor

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/projects/{id}/viewer-config` | project access | full config for editor |
| PATCH | `/projects/{id}/viewer-config` | agent(own)/editor/owner | starting_view, branding, cta_config, details_panel, nav_bounds, guided_path |
| POST | `/projects/{id}/hotspots` | editor+ | label, kind, position, camera_pose |
| PATCH | `/hotspots/{id}` | editor+ | |
| DELETE | `/hotspots/{id}` | editor+ | |
| PUT | `/projects/{id}/hotspots/order` | editor+ | bulk sort_order for guided path |
| POST | `/projects/{id}/cover` | editor+ | `{camera_pose}` → server renders cover from that view, or presigned upload |
| POST | `/projects/{id}/starting-view` | editor+ | set from current camera |
| POST | `/projects/{id}/splat-edits` | editor+ | crop bounds / deletion selections from the SuperSplat-fork editor → re-runs optimize+package stages only |

## Publishing

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/projects/{id}/publish` | agent(own)/owner | `{privacy_mode, password?}`; bumps published_version; flips assets to CDN |
| POST | `/projects/{id}/unpublish` | agent(own)/owner | back to private draft |
| PATCH | `/projects/{id}/privacy` | agent(own)/owner | change mode without republish |
| GET | `/public/tours/{slug}` | public* | viewer bootstrap: config + signed asset URLs. *Access check by mode: public → open; unlisted → valid token in slug; password → `X-Tour-Password` verified; embed_only → Origin allow-list |
| POST | `/public/tours/{slug}/password` | public | password → short-lived tour access token |
| GET | `/projects/{id}/embed-code` | project access | iframe snippet + allowed origins |

## Leads

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/public/tours/{slug}/leads` | public | name, email/phone, message, preferred_contact, viewing_at?; consent checkbox required; honeypot + rate limit + optional CAPTCHA on abuse signal; triggers agent email |
| GET | `/leads` | agent(own)/owner | inbox; filter by project/status; cursor pagination |
| GET | `/leads/{id}` | lead access | |
| PATCH | `/leads/{id}` | lead access | status (contacted/qualified/closed/spam), handled_by |

## Analytics

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/public/tours/{slug}/events` | public | batched viewer events (kind, session_id, duration, hotspot_id); cookieless; validated against published tours only; fire-and-forget 202 |
| GET | `/projects/{id}/analytics` | project access | rollups: views, uniques, avg time, room engagement, CTA clicks, leads, device/geo/referrer; `?from=&to=` |
| GET | `/agency/analytics` | owner | agency-wide rollup |

## Billing

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/billing/plan` | member | current plan, credit balance, usage this period |
| GET | `/billing/plans` | member | available plans |
| POST | `/billing/checkout` | owner | Stripe Checkout session for plan change |
| POST | `/billing/credits/checkout` | owner | buy credit pack |
| GET | `/billing/usage` | owner | credits ledger, per-tour cost history, invoices link (Stripe portal) |
| POST | `/billing/portal` | owner | Stripe customer portal session |
| POST | `/webhooks/stripe` | Stripe (signed) | subscription lifecycle, payment success → credit grants |

## Admin (staff only, separate subdomain, `is_staff_admin` + SSO + audit)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/jobs` | filter by status/failure_code/agency/date; failure-taxonomy counts |
| GET | `/admin/jobs/{id}` | full logs, artifacts, timings, cost |
| POST | `/admin/jobs/{id}/retry` | force retry, optional stage override |
| GET | `/admin/accounts` / `POST /admin/accounts/{id}/suspend` / `.../reinstate` | audited |
| POST | `/admin/projects/{id}/takedown` | abuse/privacy takedown: unpublish + flag + notify owner |
| GET | `/admin/reports` | abuse/privacy report queue (from viewer "report" link) |
| POST | `/admin/credits/adjust` | manual ledger adjustment with note (audited) |

## Cross-cutting conventions

- **Pagination:** cursor-based (`?cursor=&limit=`), `limit ≤ 100`.
- **Idempotency:** `Idempotency-Key` header honored on POST `/process`, `/publish`, checkout endpoints.
- **Webhooks (later, CRM upsell):** agency-configurable webhook on `lead.created`, `tour.published`, `job.finished` with HMAC signatures.
- **Audit:** publish/unpublish/delete/role-change/billing/admin actions and all AI removals write `audit_logs` rows.

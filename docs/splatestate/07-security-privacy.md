# 07 — Security, Privacy, GDPR, and Legal Plan

## Security

### Access control

- Role-based access enforced server-side on every endpoint (Owner / Agent / Editor / staff Admin — see [02-user-flows-ux.md](./02-user-flows-ux.md#user-roles)). Agents see only their own projects/leads; Owners see agency-wide; Editors get edit-only scopes.
- Staff admin is a DB flag never settable via public API; admin console on a separate subdomain behind staff SSO; all admin actions (including support impersonation) audited.
- Private tours are **never publicly accessible**: private/unlisted/password assets live in the private bucket and are served only via short-lived signed URLs issued after an access check (`GET /public/tours/{slug}` performs mode-specific verification). Unlisted tokens are ≥ 128-bit random; password mode uses hashed passwords + short-lived tour access tokens.
- No object-storage bucket is world-listable; the public tour bucket contains only assets of currently-published public tours (unpublish removes/invalidates within CDN TTL).

### Application security

- Auth: argon2id password hashing; rate-limited login with lockout; email verification; refresh-token rotation with reuse detection; 2FA (TOTP) post-MVP.
- **Malicious upload defense:** presigned direct-to-S3 upload (user bytes never traverse the API); content-type + magic-byte validation; size caps; FFmpeg probe/decode in a sandboxed, resource-limited, network-isolated container (media parsers are a classic RCE surface); uploads treated as untrusted data everywhere; images re-encoded before any reuse.
- Workers are outbound-only (pull model): no inbound ports on GPU fleet; worker auth via per-instance tokens; internal API on a separate listener.
- Standard web controls: CSP on viewer and app, CSRF protection, strict CORS (embed mode uses per-tour Origin allow-lists), HTML-escaping of all user content (lead messages, descriptions), SSRF-safe URL fields.
- Secrets in a manager (not env-files in repo); least-privilege IAM per service; per-environment isolation (dev/staging/prod buckets, DBs, keys).
- Dependency scanning + license scanning in CI ([03-architecture.md](./03-architecture.md#license-inventory)); image scanning for worker containers.
- Backups: nightly encrypted Postgres backups + point-in-time recovery; object storage versioning on originals; restore drills quarterly.

### Audit

`audit_logs` captures: publish/unpublish, privacy-mode changes, project deletion, member/role changes, billing events, data exports, admin actions, and **every AI removal applied to a tour** (what was removed, by which model, at what confidence) — supporting both security forensics and the truthful-representation policy.

## Privacy & GDPR

### Principles

1. **Private by default.** New tours are private drafts; nothing is public, indexed, or shared until the agent explicitly publishes. `noindex` on unlisted/password tours; only `public` tours may appear in sitemaps.
2. **Minimal data.** Raw IPs never stored (salted hashes for anti-abuse only); analytics are cookieless and session-scoped; geo is coarse (country/city).
3. **No training on user data without explicit opt-in.** `training_opt_in` defaults to false; opt-in is granular, revocable, and never bundled into ToS acceptance.
4. **Consent at upload.** Before every upload the user confirms: (a) they have permission to capture and publish media of this property; (b) they accept processing of the footage (which may incidentally contain personal data) for tour generation.

### Data subject rights (agents and incidental subjects)

- **Delete:** project deletion destroys original media, frames, masks, splat assets, tour bundles, and CDN copies (7-day soft-delete grace, then hard purge job across DB + object storage + backups per rotation schedule; audit record of the deletion retained). Account deletion cascades likewise. Users can also delete only original uploads while keeping the finished tour.
- **Export:** self-serve export of account data, project metadata, leads, and analytics (JSON/CSV) + download of original media.
- **Retention policy (defaults, published):** originals 90 days after successful processing (configurable; agent may delete earlier); frames/masks 30 days after job completion (debug window) then purged; published tour assets for subscription lifetime + 90-day grace; leads until agency deletes them; logs 90 days; backups roll off in 30 days.
- **Incidental subjects** (people in footage, neighbors' plates): pipeline privacy detection (faces, plates, documents, personal photos) defaults to blur-on for GDPR-relevant categories; viewer includes a "report a privacy concern" link feeding the admin takedown queue with an SLA.

### Compliance operations

- Records of processing activities; DPAs with subprocessors (cloud, GPU providers, Stripe, email); data-residency choice (EU region default for EU customers); privacy policy in plain language; DPO/contact route; breach-notification runbook (72-hour clock).
- Lead form: explicit consent checkbox, purpose limitation (contact about this property), agency is data controller for leads / SplatEstate is processor — reflected in ToS and DPA.

## AI ethics & truthful-representation policy (product-enforced)

**Allowed (capture artifacts & privacy):** removing tripod/operator/passers-by/pets; floater and noise cleanup; boundary cropping; bounded exposure/white-balance correction; blurring faces, plates, documents, personal photos; hiding unreconstructed areas honestly.

**Forbidden (material misrepresentation):** faking renovations or finishes; removing/hiding permanent defects, damage, stains, cracks, mold; altering room dimensions or geometry; adding objects/furniture; brightness manipulation beyond realism bounds; presenting a partial reconstruction as complete.

**Enforcement mechanisms:**
- The cleanup pipeline only operates on masked *transient/privacy* classes and statistical artifacts — there is no "remove arbitrary object" tool in the agent UI at MVP.
- Review screen lists every automated removal/correction; agent confirms before publish.
- Audit log of AI edits per tour (see above) — the evidence trail if a buyer disputes a tour.
- Viewer footer disclaimer on every tour.

## Legal / product disclaimers (shipped copy)

- "Tours are visual marketing assets, not measurement-grade scans or architectural surveys."
- "AI cleanup removes capture artifacts and protects privacy; it does not alter the property's actual condition."
- "The publisher confirms they have the right to capture, upload, and publish media of this property."
- ToS: user responsibility for upload/publication rights; acceptable-use (no scanning of properties without authorization, no harassment/doxxing use); DMCA/notice-and-takedown route; limitation of liability for reconstruction accuracy.
- **Pre-launch legal review checklist:** third-party license inventory (code + model weights), ToS/privacy policy/DPA review, GDPR records, marketing-claims review (no "accurate"/"exact" language), insurance review (E&O).

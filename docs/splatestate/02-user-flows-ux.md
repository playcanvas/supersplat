# 02 — User Roles, User Flows, and UX Screens

## User roles

| Role | Scope | Permissions |
|---|---|---|
| **Owner** | Agency | Manage agency profile & branding; manage billing & plan; invite/remove members; change member roles; view/edit **all** agency projects and leads; delete agency |
| **Agent** | Own projects | Create/edit/delete own projects; upload media; run processing; edit own tours; publish/unpublish; view own leads; view own analytics |
| **Editor** | Assigned projects | Edit tours (labels, hotspots, crop, cover, starting view); cannot upload new projects, publish, manage billing, or see leads unless granted |
| **Admin** (internal SplatEstate staff) | Platform | View processing logs; retry/cancel jobs; inspect failures; impersonate-for-support (audited); suspend accounts; handle abuse/privacy reports; manage feature flags |

Role enforcement is server-side per-endpoint (see [06-api.md](./06-api.md)) via agency membership + role checks; Admin is a separate staff flag, never grantable through the public API.

## Main user flow (happy path)

1. Agent signs up (email or Google).
2. Agent creates agency profile (name, logo, colors, contact info).
3. Agent creates a new property project (title, address, optional price/listing URL).
4. Agent chooses capture type: **360 video** (recommended) / phone video (experimental) / photo set (advanced).
5. Platform shows capture instructions for the chosen type (checklist + example clip). Agent confirms "I've read the capture guide."
6. Agent uploads the 360 video (resumable multipart; progress bar; can close the tab).
7. Platform validates the upload (container/codec/duration/resolution; equirectangular detection) and shows a pre-flight result.
8. Platform extracts frames (FFmpeg).
9. Platform runs frame quality analysis (blur, exposure, shake, duplicates, dynamic objects).
10. Bad frames are removed or downweighted; masks generated where needed.
11. Platform runs SfM — COLMAP primary; GLOMAP/global mapper, OpenSfM (spherical), HLOC as fallbacks.
12. Platform trains the Gaussian Splat (Nerfstudio Splatfacto + gsplat, mask-aware).
13. Platform runs AI cleanup: artifact reduction, boundary cropping, exposure harmonization, quality scoring.
14. Platform optimizes for web (splat-transform → SOG; mobile variant).
15. Platform creates the preview tour and notifies the agent (email + dashboard).
16. Agent reviews the tour in the editor.
17. Agent adds room labels and hotspots (AI suggestions pre-populated, Phase 3+).
18. Agent sets cover image, starting view, description, price/location, and CTA.
19. Agent publishes (unlisted link / public page / password / embed).
20. Buyer opens the link on any device.
21. Buyer explores the property (walk, look, jump to rooms via labels/hotspots).
22. Buyer submits a lead / viewing request.
23. Agent receives the lead (email + dashboard inbox) and follows up.

Throughout steps 8–15 the agent sees a live status page: current stage, percent, elapsed time, and — on failure — a plain-language reason plus recapture guidance.

## Failure flow

1. A pipeline stage fails or the quality gate rejects the input.
2. Job is marked `failed` with a machine `failure_code` and human `failure_reason` (e.g., "Video moved too fast — SfM could only register 34% of frames. Re-record walking at half speed, pausing 2 seconds in each doorway.").
3. Agent gets an email + dashboard alert with the reason and a link to the relevant capture-guide section.
4. Credit for the failed run is auto-refunded.
5. Agent can: re-upload new footage to the same project, retry (if failure was transient/infrastructure), or contact support.
6. Admin sees the failure in the ops console with full logs and artifacts for diagnosis.

## Additional flows

- **Invite flow:** Owner → Settings → Members → invite by email + role → invitee accepts → lands in agency dashboard.
- **Lead follow-up flow:** email notification → lead inbox → mark contacted/qualified/closed → (later) push to CRM.
- **Deletion flow (GDPR):** Agent deletes project → confirmation listing exactly what is destroyed (original media, frames, masks, splats, published tour, analytics) → soft-delete 7-day grace → hard purge job → audit record retained.
- **Trial-to-paid flow:** trial tour is watermarked + capped at 30-day hosting → upgrade prompt on publish screen and at day 25 → upgrading removes watermark retroactively.

## UX screen inventory

### Marketing / public

| ID | Screen | Key elements |
|---|---|---|
| P1 | Landing page | Headline + subheading (see PRD), embedded live demo tour, pricing, "what it is / isn't" honesty section |
| P2 | Demo tour | Full buyer viewer with sample property |
| P3 | Pricing | Plan table, credits explainer, FAQ |
| V1 | **Public tour viewer** | See detailed spec below |

### App — agent-facing

| ID | Screen | Key elements |
|---|---|---|
| A1 | Sign up / Log in | Email+password, Google OAuth, consent checkboxes (ToS, upload-rights confirmation) |
| A2 | Onboarding | Agency setup wizard: name, logo, brand color, phone/WhatsApp, slug |
| A3 | Dashboard | Project cards (thumbnail, status chip, views, leads), "New tour" CTA, credits remaining, recent leads strip |
| A4 | New project | Title, address, capture-type picker with recommendation badges |
| A5 | Capture guide | Per-type checklist, dos/don'ts with example clips, "common failures" gallery, confirm-and-continue |
| A6 | Upload | Drag-drop, multi-GB resumable progress, pre-flight validation results, consent checkbox ("I have permission to upload and publish this property media") |
| A7 | Processing status | Stage timeline (Ingest → Frames → Quality → Poses → Training → Cleanup → Optimize → Package → QA), live progress, ETA, cancel button, failure panel with reason + recapture link |
| A8 | Tour editor | Embedded SuperSplat-derived editor: 3D preview, crop-bounds tool, splat-delete brush, undo; side panel: rename, labels list, hotspots list, starting-view "set from current camera", cover-image capture, description/price/listing URL fields |
| A9 | Publish panel | Privacy mode selector (draft/unlisted/public/password/embed-only), share-link copy, embed-code copy, QR code, watermark notice on trial |
| A10 | Leads inbox | Lead list with status (new/contacted/qualified/closed), lead detail, per-project filter |
| A11 | Analytics | Views, uniques, avg time, room engagement, CTA clicks, device split, geo, referrers; per-project and agency-wide |
| A12 | Agency settings | Profile, branding, members & roles, invitations |
| A13 | Billing | Current plan, usage meter, credit balance, buy credits, invoices, upgrade/downgrade |
| A14 | Account settings | Profile, password, notification prefs, data export, delete account |

### App — internal admin

| ID | Screen | Key elements |
|---|---|---|
| X1 | Jobs console | All jobs filterable by status/stage/agency; failure taxonomy counts |
| X2 | Job detail | Full stage logs, artifacts (sample frames, SfM stats, training curves), retry/cancel, cost telemetry |
| X3 | Accounts | Search, plan info, suspend/reinstate, audited support-impersonation |
| X4 | Abuse/privacy reports | Report queue from viewer "report" link, takedown actions |

### Screen V1 — Public tour viewer (buyer-facing) — detailed requirements

Built on **playcanvas/supersplat-viewer** (MIT) with a SplatEstate overlay layer.

**Must have (MVP):**

- Browser-based 3D tour; desktop (mouse/keyboard: WASD + orbit) and mobile (touch: drag-look, pinch, tap-to-move / joystick) support.
- Loading screen with progress bar and agency branding.
- Cover-image-first render: cover shows instantly while the splat streams.
- Room labels (floating, tappable → camera flies to room's saved viewpoint).
- Hotspots/navigation points (curated camera positions forming the tour path; "next room" affordance).
- Agent/agency branding: logo, name, photo, brand color.
- Contact CTA: persistent button → lead form (name, email, phone, message, preferred contact method, optional desired viewing date/time).
- WhatsApp / phone quick-contact buttons (agency-configurable).
- "Schedule viewing" button (same form with date/time emphasized; calendar integration later).
- Fullscreen mode; share button (native share sheet on mobile, copy-link on desktop).
- Watermark on trial-plan tours.
- Footer disclaimer: "Visual marketing asset — not a measurement-grade scan."

**Should have:**

- Optional property details panel (price, address, description, listing URL).
- Optional photo-gallery fallback (also serves as the no-WebGL/ancient-device fallback).
- Embed mode: minimal chrome, `postMessage` resize, no external navigation.
- Guided auto-tour: camera animates along the hotspot path until the user interacts (SuperSplat's timeline/camera-pose system is the base for this).

**Performance budget:** initial interactive < 10 s on 4G mid-range Android; mobile asset ≤ ~30 MB (SOG), desktop ≤ ~80 MB; ≥ 30 fps mobile / 60 fps desktop; graceful WebGPU→WebGL fallback per PlayCanvas engine support.

## Capture guidance content (shipped in-product, screen A5)

### 360 camera (recommended)

- Walk **slowly** — half your normal pace.
- Keep the camera vertical, on a pole/selfie stick above head height.
- Keep the camera stable; no swinging.
- Turn **all** lights on; open curtains for even light.
- Open all doors before you start.
- Nobody else in the scene; avoid pets.
- No fast turns — rotate your path, not the camera.
- Don't stand closer than ~1 m to walls.
- Cover room corners; walk a loop in each room, not just the center.
- Take doorway transitions slowly: pause ~2 s on each side of every doorway.
- Avoid mirrors where possible (walk past them, don't face them).
- Record extra coverage in hallways and doorways — these are where reconstructions break.
- One continuous take for the whole property if possible.
- Target: roughly 1–2 minutes per room; 5–10 minutes total for an apartment.

### Phone video (experimental)

- Landscape orientation, 4K if available, highest stabilization.
- Move slowly; avoid motion blur (well-lit rooms only).
- Capture each room from multiple angles/heights — not one pan from the doorway.
- Keep exposure locked/stable if the camera app allows.
- No fast pans; rotate ≤ 90° over 4+ seconds.
- Avoid featureless content: don't film blank walls filling the frame; keep furniture/edges in view.
- Overlap: every part of the room should appear in several seconds of footage from different positions.

### Photo sets (advanced/professional)

- Many overlapping photos (60–80% overlap between neighbors).
- Cover all rooms including transitions between them (shoot *through* doorways from both sides).
- Consistent exposure (manual/locked); consistent white balance.
- No huge positional gaps; move in small steps, shoot ring patterns per room.
- Same camera/lens throughout; no zoom changes mid-set.
- Recommended: 150–400 photos for a typical apartment.

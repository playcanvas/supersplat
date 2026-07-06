# 01 — Product Requirements Document (PRD)

## 1. Product summary

**SplatEstate turns property footage into a photorealistic browser-based virtual tour.**

A real-estate agent records a property using a 360 camera, a normal phone video, or a photo set. They upload the media to the SplatEstate web platform. The platform:

1. Validates and analyzes the footage.
2. Extracts and quality-filters frames.
3. Reconstructs camera poses (Structure-from-Motion).
4. Trains a 3D Gaussian Splat of the property.
5. Applies AI cleanup and enhancement (masking, artifact removal, exposure harmonization, privacy blur).
6. Compresses and packages the result for the web.
7. Returns a polished, shareable browser tour link with agent branding and lead capture.

Buyers open the link on any device, walk around the property, look around freely, and contact the agent or request a viewing — without downloading anything.

**Homepage headline:** "Turn a property video into a photorealistic 3D walkthrough."

**Subheading:** "Upload a 360 video, phone video, or photo set of your listing and get a shareable virtual tour link for buyers, viewings, and property marketing."

### What SplatEstate is

- A photorealistic virtual tour generator.
- An AI-enhanced property walkthrough.
- A real-estate marketing tool.
- A shareable, embeddable, browser-based 3D listing experience.

### What SplatEstate is NOT (positioning guardrails)

- Not a CAD model generator.
- Not a measurement-grade scanner.
- Not a full Matterport clone.
- Not an architectural survey tool.
- Not an interior design tool.
- Not a game engine.

Every marketing page, onboarding screen, and tour footer reflects this: *"Tours are visual marketing assets, not measurement-grade scans."*

## 2. Target users

### Primary customer

**Independent real-estate agents and small agencies (1–20 agents).**

- Technically non-expert; they need "film → upload → link."
- Price-sensitive: Matterport-style services (€150–400/scan or hardware + subscription) are too expensive or inconvenient for most listings.
- Motivated by: winning listings (premium presentation in pitch meetings), filtering low-intent buyers, and reducing wasted physical viewings.

### Secondary customers

- Airbnb / short-term rental hosts (tour as booking conversion asset).
- Property managers (remote tenant screening, move-in/move-out records — marketing angle only).
- Renovation companies (before/after showcases).
- Hotels and event venues (venue previews).
- Student-housing companies (remote international leasing).
- Commercial property brokers (office/retail space marketing).

### Buyer persona (end-viewer, not the paying customer)

Property buyers/renters who open a shared link. They demand: instant load, intuitive navigation on phone and desktop, and an obvious way to contact the agent. They are the reason viewer performance and mobile support are non-negotiable.

## 3. Problem statement

Real-estate agents waste time and money on low-quality leads and unnecessary viewings:

1. **Static photos undersell and mislead.** Photos hide layout, flow, and proportion. Buyers show up, feel deceived by wide-angle shots, and walk away — a wasted viewing for everyone.
2. **Professional 3D scanning is expensive and inconvenient.** Dedicated scanning services or Matterport hardware require scheduling, capital cost, per-scan fees, and vendor lock-in. Most independent agents skip it entirely.
3. **Video walkthroughs are passive.** A YouTube walkthrough doesn't let the buyer look where *they* want to look.
4. **Agents need to differentiate.** In listing pitches, agents who offer "an immersive 3D tour with every listing" win mandates against agents with photos only.

The gap: **a fast, affordable, self-serve way to turn footage the agent can capture in 10 minutes into a premium interactive presentation.**

## 4. Value proposition

| For | Value |
|---|---|
| Agents | Premium listing presentation from a 10-minute capture, at a fraction of scanning-service cost; pre-qualified buyers; leads captured inside the tour. |
| Agencies | Consistent branded tour experience across all agents; team management; analytics on listing engagement. |
| Buyers | Explore the property honestly before committing travel time; view on any device. |
| Sellers/landlords | Their property is presented at its best, truthfully, to more qualified buyers. |

**Differentiators vs. incumbents:**

- No proprietary hardware requirement (any consumer 360 camera, later any phone).
- Photorealism from Gaussian Splatting exceeds stitched-panorama "dollhouse" tours in visual continuity — free movement, not point-hopping between fixed panoramas.
- AI cleanup layer produces polished results from imperfect amateur captures.
- Built entirely on a permissive open-source stack → structural cost advantage and no per-scan license fees.

## 5. Feature list (full product)

### Product modules

1. **Authentication** — email/password + OAuth (Google), email verification, password reset, sessions/JWT, 2FA (later).
2. **Agency account** — agency profile, logo, brand colors, contact details, custom slug.
3. **User roles** — Owner, Agent, Editor, internal Admin (see [02-user-flows-ux.md](./02-user-flows-ux.md#user-roles)).
4. **Property projects** — create, list, organize, archive, delete property tours; per-project metadata (address, price, listing URL, description).
5. **Upload module** — resumable multipart upload for large files (multi-GB 360 video), upload validation, progress UI.
6. **Capture guidance** — in-product instructions per capture type, checklists, example footage, pre-upload self-check.
7. **Processing queue** — asynchronous jobs, status/progress visible to the user, retries, failure reasons in plain language.
8. **Reconstruction pipeline** — frame extraction → quality filter → SfM → Gaussian Splat training → export ([04-pipeline.md](./04-pipeline.md)).
9. **AI cleanup/enhancement pipeline** — masking, artifact reduction, exposure harmonization, privacy blur, quality scoring ([04-pipeline.md](./04-pipeline.md#ai-enhancement-layer)).
10. **Review/editor screen** — SuperSplat-derived web editor: preview, crop bounds, delete floaters, labels, hotspots, starting view, cover image.
11. **Buyer-facing viewer** — SuperSplat-Viewer-derived tour player: walk/orbit, room labels, hotspots, branding, CTA, lead form ([02-user-flows-ux.md](./02-user-flows-ux.md#screen-v1--public-tour-viewer)).
12. **Publishing/sharing** — private draft / unlisted link / public page / password-protected / embed-only.
13. **Lead capture** — in-tour contact form, viewing request, notifications, lead inbox.
14. **Dashboard** — projects overview, processing status, recent leads, usage.
15. **Billing/credits** — subscriptions + processing-credit add-ons (Stripe).
16. **Admin/logs** — internal ops console: job logs, retry, failure inspection, abuse handling.
17. **Analytics** — tour views, visitors, time-in-tour, room heatmap, CTA clicks, lead conversion, device/geo/referrer.
18. **Privacy/delete/export controls** — project deletion, original-media deletion, data export, consent management.

### MVP feature checklist (Phase 2 exit)

1. User accounts
2. Agency profile
3. Property project creation
4. Large media upload (resumable)
5. 360 video upload (primary capture path)
6. Frame extraction
7. SfM / camera-pose reconstruction
8. Gaussian Splat training
9. AI cleanup / quality + masking checks (baseline)
10. Web optimization/compression
11. Preview page
12. Basic editing (crop, delete splats, rename)
13. Room labels
14. Navigation points/hotspots
15. Public/private share link
16. Buyer-facing viewer (desktop + mobile)
17. Agent branding
18. Lead capture form
19. Admin dashboard for failed jobs/logs
20. Basic billing or credit logic

## 6. MVP scope

**Platform:** Web only. No mobile app in MVP.

**Primary capture workflow:** **360-camera video upload.** Rationale:

- Complete room coverage in a single pass → far fewer failed reconstructions.
- One continuous walking path is natural with a 360 camera on a pole.
- Better demo quality for interiors; strongest visual results.
- Easier to instruct: "hold it above your head and walk slowly" beats teaching photogrammetry-style phone technique.

**Secondary inputs (present in MVP but labeled):**

- Normal phone video — labeled **Experimental**. Expectation-setting copy + stricter quality gate.
- Photo folder upload — labeled **Advanced / Professional**. For users who already know photogrammetry capture.

**Quality bar for MVP:** A well-captured 2–4 room apartment produces a tour rated "Good" or better by the internal quality score, loads in < 10 s on a mid-range phone over 4G, and is navigable at ≥ 30 fps on that device.

## 7. Non-goals (explicitly out of MVP, most out of v1 entirely)

- Full mobile capture app (Phase 6).
- Perfect floorplans.
- Accurate measurements of any kind.
- CAD/BIM export.
- Full native VR app (WebXR "nice to have" later; native never in v1).
- Automatic renovation / virtual staging / furniture replacement.
- Full Matterport clone (dollhouse view, measurement tools, schema exports).
- Multi-floor automatic alignment (manual per-floor projects instead).
- Real-time reconstruction preview during capture.
- Advanced object removal that could misrepresent the property (see AI ethics rule).
- Marketplace/community features.

## 8. Monetization plan

### Model: hybrid subscription + processing credits

Processing cost is real (GPU minutes per tour), so pure flat subscription is margin-dangerous and pure pay-per-tour kills habit formation. Hybrid:

| Plan | Price (launch hypothesis) | Included | Notes |
|---|---|---|---|
| **Free trial** | €0 | 1 tour, watermarked, 30-day hosting | Card-free; the demo IS the funnel |
| **Starter** | €39/mo | 3 tours/mo, standard queue, SplatEstate badge | Solo agents, low volume |
| **Pro** | €99/mo | 10 tours/mo, no watermark, agent branding, priority queue, analytics | Core plan; most revenue |
| **Agency** | €249/mo | 30 tours/mo, 5 seats, agency branding, white-label option, priority processing, lead routing | Small agencies |
| **Credits add-on** | €12–15/tour credit, volume discounts | Extra tours beyond plan | Also sold to trial users |

Tours = processing credits. 1 credit = 1 standard processing run (re-runs after failure are free; re-runs after re-capture cost a credit). Hosting included while subscribed; published tours grandfathered 90 days after churn, then archived (originals retained per retention policy).

### Upsells (Phase 4+)

- **Professional cleanup** (€49–99/tour): human editor polishes the splat (floater removal, cropping, hotspot placement) — human-in-the-loop as a product.
- **White-label domain** (tours.agencyname.com).
- **Agency landing pages** (branded portfolio of all published tours).
- **Lead capture premium** (SMS/WhatsApp instant alerts, lead routing rules, calendar-scheduling integration).
- **CRM integration** (webhooks first; then HubSpot/Pipedrive/propertybase connectors).
- **Priority GPU processing** (jump the queue; results in ~1 hour).
- **Done-for-you scanning service** (partner operator network; SplatEstate takes a margin).
- **Custom branding** (fully unbranded viewer, custom loading screen).
- **Analytics package** (per-room heatmaps, buyer engagement reports, listing-portal attribution).

### Unit economics guardrail

Target: GPU + storage + egress cost per tour ≤ 20% of per-tour revenue. Levers: frame-count caps, training-iteration budget per plan tier, spot GPU instances, SOG compression (10–20× smaller than raw PLY) to control egress, mobile quality tiers.

## 9. Risk analysis and mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Failed captures** — amateur footage doesn't reconstruct | High | High (refunds, churn, reputation) | 360-first strategy; strict in-product capture guidance; pre-processing quality gate that rejects bad uploads *before* burning GPU time with specific recapture instructions ("video moved too fast", "hallway transition failed"); quality score with honest labels; failed-job credits refunded automatically |
| 2 | **Processing cost blowout** | Medium | High | Credit system; frame sampling caps (≤ 600 training frames MVP); iteration budgets per tier; spot GPUs with checkpoint/resume; queue depth limits on free tier; per-job cost telemetry from day one |
| 3 | **Viewer too heavy for buyer devices** | Medium | High (buyers are the product demo) | SOG compressed format via splat-transform; mobile quality variant (reduced splat count); progressive loading + cover-image-first; fallback still-image gallery; hard QA gate on file size (< 30 MB mobile / < 80 MB desktop target) and load time |
| 4 | **License risk** — non-commercial 3DGS code contamination | Medium | Severe (rebuild or legal exposure) | Production stack restricted to the approved inventory ([03-architecture.md](./03-architecture.md#license-inventory)); CI dependency-license scanning; explicit ban on Inria `graphdeco-inria/gaussian-splatting` and its `diff-gaussian-rasterization` in any production dependency tree; legal review before launch; experimental repos quarantined to research environment ([08-personal-testing.md](./08-personal-testing.md)) |
| 5 | **AI misrepresentation** — cleanup crosses into deception | Low–Medium | Severe (legal liability, trust) | AI limited to capture artifacts, privacy items, tripod/operator removal, exposure; never structural edits; user confirmation step lists every automated removal; disclaimers in viewer footer; audit log of all AI edits per tour |
| 6 | **Privacy breach / GDPR violation** | Low | Severe | Private by default; signed URLs; deletion pipeline that actually deletes (originals, frames, masks, splats, backups within SLA); face/document/plate detection with blur offering; no training on user data without opt-in; consent checkbox at upload; DPA + records of processing |
| 7 | **Reconstruction quality plateau** — splats look "good demo, bad product" on hard properties (mirrors, glass, white walls) | Medium | Medium | Quality score honesty ("Needs review" / "Recapture recommended"); capture guidance about mirrors/glass; fallback panorama mode for failed rooms (Phase 5); manage expectations in marketing (real footage in demos, not cherry-picked) |
| 8 | **Single-founder/small-team pipeline complexity** | High | Medium | Buy-don't-build for non-core (auth provider optional, Stripe billing, managed Postgres); the AWS open-source 3D reconstruction toolbox guidance as architecture reference; Phase 1 is a hardcoded pipeline before any SaaS chrome |
| 9 | **GPU supply/pricing volatility** | Medium | Medium | Provider-agnostic worker container (plain Docker + queue pull model) runs on RunPod, Lambda, CoreWeave, or AWS interchangeably |
| 10 | **Incumbent response** (Matterport/Zillow adds splat tours) | Medium | Medium | Move fast on the low end; win on price, self-serve simplicity, and open embedding; agent relationships + lead-capture lock-in |

## 10. Roadmap

### Phase 1 — Technical proof (no SaaS)

Upload one 360 video → extract frames → COLMAP → Nerfstudio Splatfacto/gsplat → export → view in SuperSplat Viewer. Manual scripts, one GPU box. **Exit criterion: 3 different real apartments produce walkable tours you'd show an agent.**

### Phase 2 — MVP SaaS

Auth, agency profile, project dashboard, resumable upload, processing queue with status, automated pipeline, basic editor (labels/hotspots/crop), publish link, buyer viewer (desktop+mobile), lead form, basic admin, credit logic. **Exit: MVP acceptance criteria below all pass with a stranger's footage.**

### Phase 3 — AI enhancement

Frame quality scoring, blur/exposure/shake filtering, duplicate removal, person/tripod/private-object segmentation (SAM2 + detector), mask-aware training, thumbnail generation, tour quality score with plain-language reasons.

### Phase 4 — Real-estate polish

Agent branding suite, room labels UX, hotspot navigation graph, guided tour path ("best room order"), embed code, analytics dashboard, mobile performance tier, listing-text generation.

### Phase 5 — Advanced cleanup

3D inpainting (Inpaint360GS-class, license-verified), automated floating-artifact removal, seamless compositing, exposure harmonization across rooms, privacy blur/remove in 3D, "professional cleanup" human-review upsell.

### Phase 6 — Capture apps

iOS/Android guided capture with real-time quality meter, ARKit/LiDAR assist, direct upload. (Evaluate `brush`/WebGPU on-device paths here.)

### Phase 7 — Agency/business growth

Team accounts at scale, white-label, CRM integrations, property-portal integrations (Idealista/Rightmove/Zillow embed partnerships), public API, bulk processing, partner scanning network.

## 11. MVP acceptance criteria

The MVP ships when **all** of the following pass end-to-end with real (non-team) user footage:

1. User can create an account.
2. User can create an agency profile.
3. User can create a property project.
4. User can upload a 360 video (≥ 4 GB file, resumable, survives a connection drop).
5. System extracts frames.
6. System reconstructs camera poses.
7. System trains a Gaussian Splat.
8. System applies baseline AI cleanup — at minimum: frame quality filtering, quality/masking checks, and a quality score with reasons.
9. System exports a browser-viewable tour.
10. User can preview the tour.
11. User can add room labels and hotspots.
12. User can publish and unpublish.
13. Buyer can open the link on desktop **and** mobile (mid-range Android over 4G loads in < 10 s and navigates at ≥ 30 fps).
14. Buyer can submit a lead.
15. Agent sees the lead (dashboard + email notification).
16. Failed jobs show a clear, human-readable reason and a recapture suggestion.
17. Admin can inspect logs and retry jobs.

## 12. First 30/60/90-day implementation plan

### Days 1–30 — Prove the pipeline (Phase 1)

- **Week 1:** Buy/borrow a 360 camera (e.g., Insta360 X4/X5). Rent one GPU box (RTX 4090 / L4-class). Set up Nerfstudio + gsplat + COLMAP + FFmpeg in a Docker image. Capture apartment #1.
- **Week 2:** Build the frame-extraction script: FFmpeg equirectangular → perspective crops (v360 filter, 6–8 virtual pinhole views per frame), controlled FPS. Run COLMAP → Splatfacto → export PLY. Get *anything* walkable.
- **Week 3:** Iterate on quality: frame sampling rates, COLMAP settings (sequential matcher for video), Splatfacto config, OpenSfM spherical-model comparison for the same footage. Pipe exports through splat-transform → SOG. View in SuperSplat Viewer (this repo's sibling). Establish the capture protocol doc from what actually works.
- **Week 4:** Capture 3 different real properties (small apartment, larger unit with hallway, one hard case with mirrors). Document per-property GPU minutes and cost. Write the go/no-go quality memo. **Deliverable: 3 demo tour links + a repeatable `make tour INPUT=video.mp4` pipeline + cost-per-tour number.**

### Days 31–60 — Wrap it in a product (Phase 2 core)

- **Week 5:** Repo scaffolding: monorepo (web app, API, worker). Postgres schema v1 ([05-database-schema.md](./05-database-schema.md)). Auth + agency + projects CRUD.
- **Week 6:** Resumable multipart upload to S3-compatible storage; upload validation; job queue (see [03-architecture.md](./03-architecture.md#processing-queue-design)); worker pulls job, runs Phase-1 pipeline in container, streams logs/status back.
- **Week 7:** Processing status UI with stages and progress; failure reasons; retry. Viewer packaging: SOG + `viewer_config` JSON → hosted tour page on SuperSplat Viewer base.
- **Week 8:** Editor v1 (SuperSplat fork embedded: crop bounds, delete floaters, save) + labels/hotspots + cover image + publish/unpublish + share link. **Deliverable: a stranger can self-serve from signup to shared tour.**

### Days 61–90 — Make it sellable (Phase 2 finish + Phase 3 start)

- **Week 9:** Buyer viewer polish: loading screen, cover fallback, branding, CTA, lead form, mobile QA. Lead inbox + email notifications.
- **Week 10:** Billing: Stripe subscriptions + credits; free trial with watermark; usage metering. Admin console: job list, logs, retry, account suspend.
- **Week 11:** AI layer v1: blur/exposure/duplicate frame filtering in the pipeline; person/tripod detection + SAM2 masking on flagged frames; quality score with reasons surfaced to the user.
- **Week 12:** Private beta with 5–10 real agents. Instrument everything (per-stage timings, failure taxonomy, viewer load times). Fix the top 5 failure modes. **Deliverable: 10 external tours processed, ≥ 70% success rate on guided 360 captures, first paying customer conversation.**

## 13. Clear recommendation: what to build first

**Build the pipeline before the platform. Specifically, in this order:**

1. **Week 1–4: The `video → tour link` pipeline as scripts** (Phase 1). Everything else is worthless if this doesn't produce impressive tours from realistic amateur captures. This is also where all the risk lives — retire it first.
2. **The quality gate second.** Before any dashboard exists, build the pre-flight analyzer (frame quality, coverage, motion speed) — it protects GPU spend and user trust, and its failure messages are the product's most important copy.
3. **The viewer third.** Fork/adapt SuperSplat Viewer with branding + lead CTA. The buyer-facing link is the demo that sells the product; it must be excellent on mobile before the SaaS chrome exists.
4. **Then the SaaS shell** (auth → upload → queue → status → publish), which is well-understood commodity work.
5. **AI enhancement last within MVP** — start with the cheap, high-yield pieces (frame filtering, tripod masking) and defer 3D inpainting entirely.

**Deliberately do NOT start with:** the mobile app, the editor's advanced tooling, floorplans, analytics, or CRM integrations. None of them matter until the core loop (film → upload → beautiful tour → lead) is reliably impressive.

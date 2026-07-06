# SplatEstate — PRD & Technical Build Plan

> **Working name:** SplatEstate
> **Positioning:** "Turn a property video into a photorealistic 3D walkthrough."
> **Status:** Planning / pre-build. This document set is the master spec.
> **Repo context:** This repository is a fork of [playcanvas/supersplat](https://github.com/playcanvas/supersplat) (MIT) and is the foundation for the SplatEstate **editor and viewer layer**.

This directory contains the complete Product Requirements Document and technical build plan for SplatEstate — a SaaS that turns real-estate footage (360 video, phone video, photo sets) into photorealistic, browser-based Gaussian Splat virtual tours with AI cleanup, publishing, and lead capture.

## Document index

| # | Document | Contents |
|---|----------|----------|
| 1 | [01-prd.md](./01-prd.md) | Product summary, target users, problem, value proposition, feature list, MVP scope, non-goals, monetization, risks, roadmap, acceptance criteria, 30/60/90 plan, build-first recommendation |
| 2 | [02-user-flows-ux.md](./02-user-flows-ux.md) | User flows, user roles, UX screen inventory, capture guidance content |
| 3 | [03-architecture.md](./03-architecture.md) | System architecture, tech stack, open-source repo usage & license plan, processing queue design, cloud/GPU infrastructure plan |
| 4 | [04-pipeline.md](./04-pipeline.md) | End-to-end reconstruction pipeline, AI enhancement & compositing plan, quality scoring, QA gates |
| 5 | [05-database-schema.md](./05-database-schema.md) | Full PostgreSQL schema: tables, fields, types, relations, indexes |
| 6 | [06-api.md](./06-api.md) | Complete API endpoint plan: auth, agencies, projects, uploads, processing, editor, publishing, leads, analytics, billing, admin |
| 7 | [07-security-privacy.md](./07-security-privacy.md) | Security, privacy, GDPR, legal disclaimers, AI ethics rules |
| 8 | [08-personal-testing.md](./08-personal-testing.md) | Personal-testing order for experimental repos (360GS, PFGS360, SplaTAM, etc.) with license warnings — **evaluation only, not production** |

## The product in one paragraph

A real-estate agent films a property with a 360 camera (or phone), uploads the footage to SplatEstate, and the platform reconstructs the scene with Structure-from-Motion (COLMAP/GLOMAP/OpenSfM) and Gaussian Splatting (Nerfstudio Splatfacto + gsplat), cleans it with an AI enhancement layer (frame filtering, segmentation masking via SAM2, artifact cleanup, exposure harmonization, privacy blurring), compresses it for the web (splat-transform → SOG), and returns a shareable, embeddable, branded browser tour (SuperSplat Viewer–based) where buyers can walk through the property and submit viewing requests that land in the agent's lead inbox.

## Hard constraints (apply to every document)

1. **License safety.** Production stack uses only permissive-license open source (MIT, Apache-2.0, BSD, PostgreSQL-style). No Inria non-commercial 3DGS code, no no-license repos, no AGPL (unless deliberately accepted), no research-only forks. A license inventory is maintained in [03-architecture.md](./03-architecture.md#license-inventory). Final legal review required before launch.
2. **Truthful representation.** AI cleans capture artifacts, removes tripods/people, fixes exposure, and blurs private items. AI must never fake renovations, hide damage or permanent defects, alter room dimensions, or otherwise materially misrepresent the property.
3. **Privacy by default.** Tours are private drafts until explicitly published. Uploads are deletable, never used for model training without explicit opt-in, and processed with GDPR-compliant controls.
4. **Marketing asset, not survey.** SplatEstate output is a visual marketing asset — not a measurement-grade scan, CAD model, or architectural survey — and is labeled as such throughout the product.

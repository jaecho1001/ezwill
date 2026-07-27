# Roadmap — EzWill

> Last updated: 2026-07-27. Organized by platform pillar. Feature detail and status live in
> GitHub issues; this is the orienting map, not a backlog.

## Legal delivery (primary — the app itself)

- **Now:** production-readiness epic #95. Reconnect the complete nine-section intake to the
  lawyer workspace (#87) and enforce an attributable lawyer approval step before client
  delivery (#86). Obtain lawyer-approved residue and POA wording while the interim semantic
  generation guards from #83/#85 prevent silent contradictions.
- **Next:** finish issue #75 parity: full EN/KO summary and validation, reusable people,
  self-serve entry routing/decision (#81), placeholder coverage matrix (#84), real-user
  accessibility testing, then retire the legacy `/will/*` questionnaire. Continue the
  versioned Annotated Will pipeline + lawyer-reviewed clause assistant (issue #64).
- **Later:** future document types — codicil, memorandum of personal effects (issue #45);
  AI-powered estate planning beyond wills — life insurance, tax/EAT optimization, business
  succession (issue #42).
- **Done:** three portals built; versioned nine-section lawyer-link intake foundation;
  60+ clause library (15 sections); 9-rule Ontario AI-flag
  engine; 8 document types; python-docx generation; magic-link intake + client review
  portal; auth middleware; CSV export; GHL notifications; Docker Compose stack.

## Connected tools (integration backbone)

- **Now:** identity linking via `ix_cross_client_map.ew_client_id` (implemented).
- **Next:** decide whether/when to implement the `ix_sync_events` event bus so EzWill
  publishes `ew.will.created` / `ew.poa.created` etc. (Bible blueprint; not built yet).
- **Later:** CaseLawVision agent orchestration — EzWill's will agent participating in the
  platform Agent Manager (issue #40).

## Production hardening (cross-cutting, mostly Connected tools)

- **Now / high priority (open issues):** privacy/consent/AI disclosure (#90); remove
  hardcoded/default secrets (#57); real per-lawyer SSO + attributable audit trail (#52);
  HTTPS/TLS + secure cookies (#54); automated Postgres backups + restore test (#56).
- **Next:** monitoring, structured logging, error tracking (#58); Vercel + Supabase
  production deploy for Ontario testing (#65).
- **Marketing/branding touch:** hero video for the landing page (#66) — supports client
  acquisition (Pillar 2) but delivered by `contentmachine`, not core to this app.

## Critical path

`Lawyer workspace complete → lawyer approval enforced → legal wording approved →
real-DB end-to-end flow proven → privacy/security/backup gates → production deploy →
(optional) ix_ event-bus + agent orchestration.`
Legal output stays lawyer-approved at every phase.

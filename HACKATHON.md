# Volo x NEAR: what was built during the hackathon

Volo (Arbitrum onchain automation with a contract-enforced rule layer) existed before
1 Nov 2026. This file lists only the work added from 1 Nov 2026 onward, so it is easy
to review. See the git history on the `near-hackathon` branch for every commit.

## Before the hackathon (baseline)
- Plain-English rule parser with grounding checks
- `PulseAutomation.sol` contract (locked recipient, caps, weekday, once per day, balance condition)
- Worker, Next.js app, ZeroDev smart-account code, Supabase storage

## Added during the hackathon
- Renamed the project to Volo x NEAR (package names, README, script text). Env var names
  (`PULSE_*`) and the deployed contract name are unchanged so existing deployments keep working.
- NEAR Intents integration: _in progress_

## Tracks
Real-World Money, Autonomous Business, AI Security & Defense

# Mission Control — Enhancements & Roadmap

## Planned

- [ ] **Model Routing controls** — Allow switching primary model + reordering fallbacks from Settings, wired to `openclaw config set`
- [ ] **Heartbeat interval controls** — Wire interval dropdown to create/edit cron jobs via `openclaw cron add/edit`
- [ ] **Export/Import OpenClaw config** — Extend Export/Import card to also backup/restore `openclaw.json` (agent config), not just `mc-config.json`
- [ ] **Live model usage stats** — Show per-model token usage breakdown (which fallback models are actually being hit)
- [ ] **Cron job editor** — Visual cron schedule builder instead of CLI-only management
- [ ] **Notification preferences** — Configure which events trigger Slack notifications vs just dashboard feed

## Ideas

- [ ] Dark/light theme toggle
- [ ] Mobile push notifications via service worker
- [ ] Multi-agent dashboard — manage multiple OpenClaw agents from one MC instance
- [ ] Conversation search — full-text search across all session transcripts
- [ ] Cost tracking dashboard — daily/weekly/monthly spend charts by model

## Completed

- [x] Automated update checks + one-click Update Now from Dashboard and Settings
- [x] Live system info on Settings page (replaced hardcoded values)
- [x] Roadmap viewer/editor on Settings page

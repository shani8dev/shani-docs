---
title: Shani Platform API
section: Software & Apps
updated: 2026-09-18
---

# Shani Platform API

`platform.shani.dev` is the unified backend for the Shanios commercial planes: fleet management, billing, licensing, notifications, and the org-scoped fleet web console. Both fleet agents (`shani-fleet`, `shani-insights`) enroll and report through this same backend. This page is the reference for its HTTP surface; the agent-side enrollment flow is covered in the [Fleet Monitoring Runbook](../enterprise/fleet-monitoring.md).

## Authentication Model

- **JSON API** (`/fleet/*`, `/notify/*`, `/orgs/*`, etc.) uses `Authorization: Bearer <JWT>` — RS256-signed, with `kid` rotation and `GET /.well-known/jwks.json` exposing the current key set.
- **Payment webhooks** (`/billing/webhooks/*`) authenticate by provider signature — Stripe, Razorpay, and PayPal signatures are verified server-side.
- **Fleet agent endpoints** (heartbeat, task/command results, console polling) additionally require a machine identity derived from the enrollment token — agents authenticate with a per-machine key, not a user JWT.
- **Web console** (`/fleet/console/*`) uses cookie sessions + a per-`jti` HMAC CSRF token; all mutating console routes go through `CSRFMiddleware` automatically.
- **Internal server-to-server calls** may use an API token (see roadmap item "API_TOKEN Auth for Mutating Routes" in `shani-platform`'s `AGENTS.md`) — scoped to specific endpoints, never a blanket bypass of the auth above.

## Identity & Auth `/auth/*`

| Method | Path | Purpose |
|---|---|---|
| POST | `/signup` | Create an account (JSON) |
| POST | `/login` | Issue a session JWT |
| GET | `/me` | Current user profile (`platform_admin` claim included) |
| POST | `/logout` | Revoke the current session |
| POST | `/logout-all` | Revoke every session |
| POST | `/2fa/enable` | Enable 2FA |
| POST | `/2fa/verify` | Verify a 2FA code |
| POST | `/forgot-password` | Request a password reset |
| POST | `/reset-password` | Complete a password reset |
| POST | `/change-password` | Change password (also clears forced-rotation) |

SSO login/callback live under `/auth/sso`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/sso/{org_slug}/login` | OIDC start |
| GET | `/auth/sso/{org_slug}/callback` | OIDC callback |
| GET | `/auth/sso/{org_slug}/saml/metadata` | SAML SP metadata |
| GET | `/auth/sso/{org_slug}/saml/login` | SAML login redirect |
| POST | `/auth/sso/{org_slug}/saml/acs` | SAML assertion consumer |

## Fleet Agent API `/fleet/*`

Used by the installed agents (`shani-fleet`, `shani-insights` — shared endpoints distinguished by a `product` field):

| Method | Path | Purpose |
|---|---|---|
| POST | `/fleet/enrollment-tokens` | Create an enrollment token (`product: "fleet"` or `"insights"`) |
| POST | `/fleet/enroll` | Enroll a machine using its token |
| POST | `/fleet/heartbeat` | Periodic machine heartbeat (drives online/offline state) |
| POST | `/fleet/tasks/{task_id}/result` | Report a task result |
| POST | `/fleet/commands/{command_id}/result` | Report a command result |
| GET | `/fleet/console-check` | Poll for pending console work |
| GET | `/fleet/console/commands/pending` | Fetch pending console commands |
| POST | `/fleet/console/commands/{command_id}/output` | Push console command output |
| POST | `/fleet/console/stats` | Report console session stats |
| GET | `/fleet/console/commands/{command_id}/blob` | Fetch linked blob |
| POST | `/fleet/console/commands/{command_id}/blob` | Upload linked blob |
| GET | `/fleet/machines` | Machine list (JSON) |
| GET | `/fleet/alerts` | Alert list (JSON) |
| POST | `/fleet/groups/{group_name}/command` | Dispatch a command to a whole group |
| GET | `/fleet/evidence/export.json` | Evidence export (JSON) |

## Fleet Licenses `/fleet/licenses/*`

| Method | Path | Purpose |
|---|---|---|
| POST | `/fleet/licenses/issue` | Issue a machine license |
| POST | `/fleet/licenses/renew` | Renew a machine license |
| GET | `/fleet/licenses/status` | Current license status |
| POST | `/fleet/licenses/auto-sync` | Server-to-server license sync (machine-key authenticated) |

## Fleet Compliance `/fleet/compliance/*`

| Method | Path | Purpose |
|---|---|---|
| POST | `/fleet/compliance/signing-profiles` | Create a signing profile |
| GET | `/fleet/compliance/signing-profiles` | List signing profiles |
| POST | `/fleet/compliance/mirror-manifests` | Create a mirror manifest |
| GET | `/fleet/compliance/mirror-manifests/{org_id}/{channel}` | Fetch a mirror manifest |

## Fleet Web Console `/fleet/console/*`

HTML pages and their backing JSON endpoints — machines, alerts, audit, activity, settings (billing/team/notifications/webhooks/security/sessions/SSO), trust, API tokens, scheduled commands, rings, live stream. Highlights:

| Method | Path | Purpose |
|---|---|---|
| GET | `/fleet/console/login` · `/signup` | Cookie-auth pages |
| GET | `/fleet/console` | Console dashboard |
| GET | `/fleet/console/machines` | Machines page (+ CSV export) |
| POST | `/fleet/console/machines/{machine_id}/command` | Send a command to a machine |
| POST | `/fleet/console/machines/{machine_id}/tasks` | Enqueue a task |
| GET | `/fleet/console/machines/{machine_id}/console` | Remote-console page |
| POST | `/fleet/console/machines/{machine_id}/console/exec` | Execute in the remote console |
| POST | `/fleet/console/machines/{machine_id}/console/fs/list` · `read` · `write` · `delete` | Remote filesystem (path-traversal guarded) |
| GET | `/fleet/console/alerts` · `/alerts/history` | Alerts pages |
| POST | `/fleet/console/alerts/{alert_id}/resolve` | Resolve an alert |
| GET | `/fleet/console/audit` · `/audit/export.csv` | Audit log |
| GET | `/fleet/console/settings/security` | Security settings (2FA, allowlist, sessions) |
| GET | `/fleet/console/updates` | Updates page |
| POST | `/fleet/console/api/tokens` | Issue an org API token |
| GET | `/fleet/console/stream` | Live event stream |

## Billing `/billing/*`

| Method | Path | Purpose |
|---|---|---|
| GET | `/billing/entitlements/{org_id}` | Current plan entitlements |
| GET | `/billing/payment-providers` | Enabled payment providers |
| POST | `/billing/checkout` | Create a checkout session (Stripe / Razorpay / PayPal) |
| POST | `/billing/webhooks/{provider}` | Provider webhooks (signature-verified) |

## Notifications `/notify/*`

| Method | Path | Purpose |
|---|---|---|
| GET | `/notify/settings` · PUT | Read/update notification settings |
| GET | `/notify/channels` | Configured channels |
| POST | `/notify/test` | Send a test notification |
| POST | `/notify/alert` | Raise an alert |
| POST | `/notify/digest/subscribe` · `/unsubscribe` | Manage digest subscriptions |
| POST | `/notify/digest/send-now` | Build and email the current fleet-status digest |

## Organizations `/orgs/*`

| Method | Path | Purpose |
|---|---|---|
| POST | `/orgs/invite` | Invite a user |
| GET | `/orgs/invite/{token}` | Resolve an invite |
| POST | `/orgs/invite/{token}/accept` | Accept an invite |

## Trust `/trust/*`

| Method | Path | Purpose |
|---|---|---|
| POST | `/trust/artifacts` | Register a signed artifact |
| GET | `/trust/artifacts` · `/artifacts/{artifact_id}` | Query artifacts |
| POST | `/trust/attestations` | Register an attestation |
| GET | `/trust/attestations` | Query attestations |

## Platform Admin `/admin/*`

Cross-org read-only views plus account management, gated by `require_platform_admin` (and the forced-password-rotation gate):

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin` · `/admin/orgs` · `/admin/users` · `/admin/subscriptions` | Overview panes |
| GET | `/admin/audit` | Global audit log |
| POST | `/admin/users/{user_id}/is_admin` | Promote/demote a platform admin |
| POST | `/admin/orgs` · `/admin/orgs/{org_id}/plan` | Org management |
| GET | `/admin/coupons` · POST | Coupon management |
| GET | `/admin/enterprise-leads` · POST `/enterprise-leads/{lead_id}/contacted` | Enterprise lead tracking |

## Infrastructure Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/.well-known/jwks.json` | Current JWK set (JWT key rotation) |
| GET | `/metrics` | Prometheus-style service metrics |

## See Also

- [Fleet Monitoring Runbook](../enterprise/fleet-monitoring.md) — the agent-side enrollment and reporting flow
- [Pacman Keyring & Trust Root](../security/keyring.md) — machine identity and signing trust
- [Shani Package Repository](shani-repo.md) — what ships through `repo.shani.dev`
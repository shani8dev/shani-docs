---
title: Compliance & Benchmarks
section: Enterprise
updated: 2026-08-28
---

# Compliance & Benchmarks

How Shanios maps to common audit frameworks, what is satisfied by construction versus what remains an administrative action, and how to generate evidence for each control area.

Immutability changes the compliance equation in one specific way: most configuration-management controls exist to detect or prevent drift on a mutable system. On Shanios the OS cannot drift. `/usr` is physically read-only, the running system always corresponds to a GPG-signed image, and every OS change is an atomic, logged slot deployment. Controls that target **system integrity** are satisfied by construction; controls that target **operational process** (access reviews, backup testing, centralised retention) remain yours to run, exactly as on any other distribution.

| Category | Meaning | Owner |
|---|---|---|
| Satisfied by design | True of every stock Shanios machine, verifiable on-box with one command | The platform |
| Admin action | Default is safe but incomplete; site policy must finish the job | You |

The mapping below references benchmark *areas* deliberately at that level of granularity — for example, "the CIS Arch Linux benchmark's boot area" rather than a specific control number. Shanios has not been certified against any scheme; control IDs must be mapped against the exact benchmark revision your auditors use.

Using this page in an assessment:

1. Inventory which benchmark areas are in scope for your audit.
2. For each area classified *satisfied by design*, run the evidence command on a sample of hosts and archive the output with hostnames and timestamps.
3. For each area classified *admin action*, write the site policy that completes the control and attach it to the same evidence package.
4. Schedule recollection (below) so evidence stays current between audits.

---

## Satisfied by Design

Every row below holds on a stock installation with no additional hardening.

| Benchmark area | Shanios default | Evidence command |
|---|---|---|
| Filesystem integrity (CIS Arch Linux benchmark — filesystem area) | `/usr` mounted read-only, even for root; IMA/EVM active in the LSM stack | `findmnt /` ; `cat /sys/kernel/security/ima/active` |
| Boot chain (boot area) | Shim + MOK-signed UKIs under Secure Boot; kernel cmdline embedded in the UKI, boot menu editor disabled | `bootctl status` ; `shani-health --security` |
| Package provenance (package management area) | All OS packages from the GPG-signed `[shani]` repo or baked into the signed image; no third-party repos added at runtime | `pacman -Q` (inventory) ; `shani-health --verify` (deep integrity) |
| Malware persistence surface (system hardening area) | Root cannot write to system paths at runtime; binaries are replaced only wholesale via verified deploys | `findmnt /` (ro) ; `shani-health --verify` (immutability checks) |
| Kernel hardening sysctls (kernel/network hardening area) | Shipped in `/usr/lib/sysctl.d/90-security-hardening.conf` (`kptr_restrict`, `dmesg_restrict`, ASLR, BPF JIT hardening, protected links) | `cat /usr/lib/sysctl.d/90-security-hardening.conf` ; `sysctl kernel.kptr_restrict` |
| Mandatory access control (access control area) | AppArmor enforced as part of the six-module LSM stack (`lsm=landlock,lockdown,yama,integrity,apparmor,bpf`) | `sudo aa-status` |
| Audit logging (logging & audit area) | `auditd` enabled by default with the base ruleset (`/etc/audit/rules.d/10-shani-base.rules`) watching identity, privilege escalation, modules, mounts | `sudo ausearch -ts today` |
| Time synchronisation (time sync area) | systemd-timesyncd active from first boot | `timedatectl` |
| Update integrity (integrity of deployed software area) | SHA256 + GPG verification of every downloaded image before deployment, against pinned key `7B927BFFD4A9EAAA8B666B77DE217F3DA8014792`; verification failures abort the deploy | `shani-health --history` (deploy/rollback events) |

---

## Areas Requiring Admin Action

These controls ship safe defaults but are incomplete without site policy:

| Area | Baseline shipped | What your site must add |
|---|---|---|
| Disk encryption | LUKS2 argon2id offered at install; TPM2 auto-unlock seals the key to PCRs 0 and 7 | Choose encryption at install time; document your key-recovery position (there is no foreign key escrow) |
| SSH hardening | Server profile runs sshd with root login disabled and per-instance host keys; firewalld + fail2ban active | Site cipher/KMA policy, bastion-host rules, certificate-based auth if required |
| Centralised log shipping | Persistent journald capped locally (128 MB x 2 files) — retention is deliberately small | Forward to your SIEM: journald forwarding or rsyslog-in-container — see [System Logging](../system/logging.md) |
| User access reviews | Sudo gated on `wheel` group membership | Periodic membership review with joiners/movers/leavers process and sign-off |
| Backup verification | Backup tooling documented ([Backups & Sync](../servers/backups-sync.md)) | Scheduled restore drills with recorded results |

---

## Generating Evidence

### Machine-readable integrity summary

`shani-health --verify --json` runs the deep integrity check (UKI signatures, Btrfs scrub of both slots, slot markers, boot entries, immutability) and emits a structured JSON summary: an overall pass/fail result plus one entry per individual check, each carrying an identifier and a pass/fail status field. Exit code `0` means all checks passed, `1` that something failed — usable directly as an alert gate:

```bash
# Non-zero exit means alert
shani-health --verify || echo "VERIFY FAILED on $(hostname)"

# Pull just the failing checks out of the JSON summary
shani-health --verify --json | jq '.checks[] | select(.status == "fail")'
```

> **Note:** `--verify` includes a full Btrfs scrub and can take minutes on large volumes. Schedule accordingly.

### Scheduled evidence collection

cronie is enabled by default on the server profile. A daily evidence snapshot:

```crontab
# /etc/cron.d/shani-compliance-evidence
0 4 * * * root shani-health --verify --json > /var/local/shani-health.json
30 4 * * * root shani-health --export-logs /var/local/evidence >/dev/null 2>&1
```

Collect `/var/local/shani-health.json` and the exported log bundles centrally (rsync over Tailscale or SSH) so evidence survives even a compromised or wiped host.

For ad-hoc auditor requests, `--export-logs` bundles deploy logs, journal extracts (secrets filtered), boot state, and slot information into a single archive — see [shani-health Reference](../updates/shani-health.md).

Suggested recollection cadence:

| Evidence | Cadence | Trigger to re-collect early |
|---|---|---|
| `shani-health --verify --json` | Nightly (cron above) | Any failed deploy or rollback |
| Satisfied-by-design command outputs | Quarterly sample | New image release on your channel |
| Admin-action attestations (reviews, drills) | Per your policy | Staff or infrastructure changes |
| Exported log bundles | Monthly pull | Security incident on any host |

Because every machine on a channel runs an identical verified image, quarterly sampling is defensible in a way it rarely is on mutable distributions: a control verified on one machine holds on all of them until the next slot deployment, and each deployment is itself GPG-gated.

---

## Auditd Baseline

The kernel audit subsystem is always active; `auditd` writes events persistently and ships with a base ruleset covering identity files, privilege escalation, module loading, mounts, deletions, and time changes. Full ruleset contents, customisation guidance (`20-*.rules` drop-ins), rotation settings, and AppArmor-correlation queries are documented in [Audit (auditd)](../security/audit.md). For review workflows:

```bash
sudo aureport --summary        # overall activity
sudo aureport --failed         # failed events only
sudo ausearch -k privilege_escalation --start today
```

---

## Honest Limitations

- **No certification.** Shanios has not been assessed against CIS, ISO 27001, SOC 2, FedRAMP/FIPS, or any other scheme. Nothing here should be read as a claim of certification.
- **Informational mapping only.** Benchmark areas above are indicative anchors, not control mappings. Map them yourself against the benchmark revision in scope for your audit.
- **Site-specific tailoring is mandatory.** Encryption choice, log destinations, access reviews, backup drills, and exception handling depend on your environment and cannot come from an OS image.
- **Benchmarks evolve.** A stock install passing today's Arch Linux benchmark areas may need re-validation when the benchmark updates.
- **Some controls are out of scope for any OS image** — physical security, personnel vetting, network segmentation policy. Plan for them separately.

---

## See Also

- [OEM & Fleet Deployment](fleet) — channels, unattended updates, image signing
- [Security Features](../security/features.md) — full security model, sysctls, blacklists
- [Audit (auditd)](../security/audit.md) — shipped ruleset and query patterns
- [shani-health Reference](../updates/shani-health.md) — `--verify`, `--security`, exit codes

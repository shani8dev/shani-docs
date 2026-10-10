---
title: NUT (Network UPS Tools)
section: Networking
updated: 2026-10-10
---

# NUT — Network UPS Tools

NUT monitors uninterruptible power supplies, power distribution units, automatic
transfer switches and solar controllers, and triggers a graceful system shutdown
when the battery runs out. It is pre-installed on Shani OS.

**About the change (2026-10-10):** this page used to describe `apcupsd`, which
ShaniOS shipped before. apcupsd has had no upstream release since 3.14.14
(2016/2017) — Arch still ships that version, repackaged nine times with the code
unmoved. NUT is at 2.8.5, its data model is published as **IETF RFC 9271**, it
covers 170+ manufacturers over serial, USB, SNMP and IPMI, and it ships an
`apcupsd-ups` driver that still reaches apcupsd-controlled hardware, so nothing
that worked before is lost.

**Active by default, with nothing to monitor yet.** ShaniOS starts the NUT stack
on a fresh install — `MODE=standalone` with `ALLOW_NO_DEVICE=true` — so a UPS you
plug in later is picked up without you enabling anything. Until then it reports
that no device is configured, which is the honest answer rather than a fault.

---

## Find your UPS

```bash
sudo nut-scanner -U
```

This discovers USB, serial, SNMP, NetXML and IPMI devices and prints a complete,
ready-to-paste section naming the driver and port your hardware actually needs.
That is the step to do first: which protocol a UPS speaks is a fact about the
device, and a wrong value fails as a driver that exits silently rather than as an
error you can see.

Copy the section it prints into `/etc/nut/ups.conf`:

```ini
[myups]
    driver = usbhid-ups
    port = auto
    desc = "local UPS"
```

Then restart the stack:

```bash
sudo systemctl restart nut-server.service nut-monitor.service
```

---

## What happens when the power goes

`/etc/nut/upsmon.conf` holds the policy. This is a **directive** file — `KEY
value` per line, no `=` and no sections — which is a different shape from the
INI-like `ups.conf` and `upsd.users` beside it.

```ini
MONITOR myups@localhost 1 monuser <password> master
MINSUPPLIES 1
SHUTDOWNCMD "/sbin/shutdown -h +0"
POWERDOWNFLAG /etc/killpower
DEADTIME 15
POLLFREQ 5
POLLFREQALERT 5
FINALDELAY 0
```

| Key | What it does |
|---|---|
| `MONITOR` | which UPS to watch. The form is `system powervalue user password (master\|secondary)`. Five values after the key — a short line is a syntax error to upsmon and the UPS is never monitored. |
| `MINSUPPLIES` | how many supplies must be on battery before shutdown starts. `0` is accepted and can then never fire. |
| `SHUTDOWNCMD` | the command that brings the machine down. Quote it: unquoted, only its first word is a command and the rest become arguments nothing reads. |
| `POWERDOWNFLAG` | the flag file telling the driver to cut UPS power once the machine is down. |
| `DEADTIME` | seconds of no answer before the UPS counts as gone. When it fires, upsmon treats that as on-battery, because an unreachable UPS is indistinguishable from a dead one. |
| `POLLFREQ` / `POLLFREQALERT` | seconds between checks on mains and on battery. The battery value is the more useful one to lower. |
| `FINALDELAY` | seconds between running `SHUTDOWNCMD` and upsmon exiting. |

**There is no battery-percentage shutdown threshold.** This is the one thing
apcupsd had that NUT does not, and it is worth knowing before you look for it:
upsmon responds to the UPS *hardware's own* low-battery signal, so you cannot set
"shut down at 15%". Getting a charge- or runtime-based trigger instead needs
`dummy-ups` with overridden `battery.charge`/`battery.runtime` values plus
`upssched`, which is a deliberate advanced setup rather than a default.

### Setting the policy from the window

ShaniOS' **Cassini** settings manager has a UPS page that edits exactly these
keys, checks each one before it is written, and tells you a restart is needed —
apcupsd and NUT both read their configuration once at startup.

---

## Status

```bash
upsc myups@localhost              # everything NUT reports, as it reports it
systemctl status nut-monitor.service
```

Key fields in `upsc` output:

| Field | Meaning |
|---|---|
| `ups.status` | `OL` on line, `OB` on battery, `LB` low battery |
| `battery.charge` | charge as a percentage |
| `battery.runtime` | estimated remaining runtime in seconds |
| `ups.load` | load on the UPS |
| `input.voltage` | mains voltage |
| `battery.voltage` | battery voltage |

---

## Files and who owns them

| File | What it holds | Edit it? |
|---|---|---|
| `/etc/nut/ups.conf` | the device — driver, port, `desc` | yes, or let `nut-scanner -U` write it |
| `/etc/nut/upsmon.conf` | the shutdown policy | yes |
| `/etc/nut/upsd.conf` | where the data server listens. ShaniOS ships it bound to `127.0.0.1` only. | only with care — see below |
| `/etc/nut/upsd.users` | the monitor credential | **no** — see below |
| `/etc/nut/nut.conf` | which NUT layers run. ShaniOS ships `MODE=standalone`. | no |

**`upsd.users` is not editable and is not shown.** It holds the credential that
can issue a forced shutdown of the UPS. ShaniOS generates it once per install in
its packaging hook, rather than shipping a fleet-wide value that would be one
password able to power down every machine's UPS.

**`upsd.conf` ships bound to loopback only**, and the same reasoning applies: the
monitor user can force a power-down, so reachable network plus a guessable
password is a remote power-off primitive. NUT's own calls that mode `netserver`
and notes it "is opened to the network [so] a special care should be applied to
security concerns". If a second machine ever needs to monitor this UPS, that is
a deliberate change, not a `LISTEN` widened for convenience.

---

## Multi-machine monitoring

ShaniOS runs NUT in `standalone` mode — one UPS, one machine. NUT also supports
`netserver` (share this UPS with other machines) and `netclient` (watch a UPS
somewhere else). Both are documented in `nut.conf` and both are opt-in, because
the first opens a network service and the second depends on one.

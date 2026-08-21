---
title: Audio (PipeWire)
section: System
updated: 2026-08-21
---

# Audio (PipeWire)

Shanios uses **PipeWire** as the entire audio (and video) server on every edition — it replaces PulseAudio and JACK with a single unified daemon that's compatible with both APIs. `shani-multimedia` installs the full stack; **WirePlumber** is the session manager that handles routing and device policy.

## The Stack

- **pipewire** — the core media server
- **pipewire-pulse** — PulseAudio compatibility layer (any app expecting PulseAudio just works)
- **pipewire-jack** — JACK compatibility layer (pro-audio apps work without a separate JACK server)
- **pipewire-alsa** — ALSA compatibility layer
- **wireplumber** — session/policy manager: decides default devices, routing, and volume behavior
- **rtkit** — grants PipeWire real-time scheduling priority without running as root
- **sof-firmware** / **alsa-firmware** — firmware for Intel SOF (Sound Open Firmware) laptops and other devices that need it loaded at runtime

```bash
# Confirm the stack is running
systemctl --user status pipewire pipewire-pulse wireplumber
```

## Basic Control — pactl / wpctl

Both the PulseAudio-compatible `pactl` and PipeWire-native `wpctl` work; `wpctl` is generally preferred for PipeWire-specific tasks.

```bash
# List playback devices (sinks) and input devices (sources)
wpctl status

# Set default output device
wpctl set-default <sink-id>

# Volume control (0.0-1.0, or use % with pactl)
wpctl set-volume <sink-id> 0.5
wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+   # raise by 5%
wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle

# List sinks/sources the PulseAudio-compatible way
pactl list sinks short
pactl list sources short

# Set default sink by name
pactl set-default-sink <sink-name>

# Per-application volume
pactl list sink-inputs
pactl set-sink-input-volume <input-id> 50%
```

## GUI Volume Mixers

**GNOME:** Settings → Sound covers basic device/volume control. For per-app mixing and advanced routing, install **Pavucontrol** (Flatpak) — it works against PipeWire's PulseAudio compatibility layer with no configuration needed.
**KDE Plasma:** The Plasma audio applet in the system tray covers the same basics natively.

## Switching Default Devices

```bash
# List all available sinks with their IDs
wpctl status
# Output includes a tree like:
#  Sinks:
#   *   45. Built-in Audio Analog Stereo
#       52. USB Headset

# Switch default output
wpctl set-default 52
```

Bluetooth audio devices appear in this same list once paired — see [Bluetooth](../networking/bluetooth) for pairing and codec details.

## Recording / Screen Capture Audio

```bash
# Record from the default microphone
pw-record ~/recording.wav

# Record system audio output (loopback) — capture what you hear, not the mic
pw-record --target=@DEFAULT_AUDIO_SINK@ ~/system-audio.wav

# List all PipeWire nodes (low-level view, useful for routing/debugging)
pw-cli list-objects | grep -A2 node.name
pw-top   # live view of active streams and their CPU/latency load
```

## Configuration

PipeWire and WirePlumber read config from `/usr/share/pipewire`/`/usr/share/wireplumber` (defaults) and `~/.config/pipewire`/`~/.config/wireplumber` (user overrides — created only if you add a file there).

```bash
# Example: override the default sample rate
mkdir -p ~/.config/pipewire/pipewire.conf.d
cat > ~/.config/pipewire/pipewire.conf.d/99-samplerate.conf << 'EOF'
context.properties = {
    default.clock.rate = 48000
}
EOF

systemctl --user restart pipewire wireplumber
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No sound at all | `systemctl --user restart pipewire pipewire-pulse wireplumber`; check `wpctl status` shows a sink |
| Sound distorted/crackling | Usually a sample-rate mismatch — check `pactl list sinks \| grep "Sample Spec"`; reset config: remove `~/.config/pipewire/pipewire.conf.d/*` and restart |
| No audio on a new Intel laptop | SOF firmware may not have loaded — `dmesg \| grep -i sof`; confirm `sof-firmware` is present (it's pre-installed) and try a kernel update |
| Bluetooth headphones connected but silent | Confirm the device shows as a sink: `pactl list sinks short \| grep bluez`; set it as default: `wpctl set-default <id>` |
| App doesn't appear in the volume mixer | Some apps need `pipewire-pulse` specifically — confirm it's running; Flatpak apps need `--socket=pulseaudio` permission (usually granted by default via the portal) |
| Mic not detected | `wpctl status` should list it under Sources; check it's not muted at the hardware level (some laptops have a physical mic-mute key) |
| High audio latency (pro-audio use) | Use `pw-top` to inspect quantum/latency; JACK apps can request lower latency directly since `pipewire-jack` provides full JACK API compatibility |

## See Also

- [Bluetooth](../networking/bluetooth) — pairing audio devices, codec support
- [Hardware](hardware) — general audio hardware detection
- [What's Included](../intro/whats-included) — full audio codec support list

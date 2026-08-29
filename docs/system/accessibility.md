---
title: Accessibility
section: System
updated: 2026-08-28
---

# Accessibility

Shanios pre-installs a full accessibility stack on every desktop edition (GNOME, KDE Plasma, and COSMIC) — a screen reader, speech synthesis, braille display support, and a complete set of input methods for non-Latin scripts. None of it needs to be installed separately; it's a matter of turning on what you need.

## Screen Reader — Orca

**Orca** reads screen content aloud and supports full keyboard navigation without a mouse.

- **GNOME:** Settings → Accessibility → Screen Reader, or toggle instantly with `Super+Alt+S`
- **KDE Plasma / COSMIC:** launch `orca` directly, or add it as a startup application; Orca is a GTK/AT-SPI application and works under any desktop that implements the AT-SPI accessibility bus (GNOME, KDE, and COSMIC all do)

```bash
# Start Orca manually
orca

# Check Orca's current preferences
orca --show-preferences
```

## Speech Synthesis — espeakup

**espeakup** bridges the Linux kernel's Speakup screen-reader framework to the `espeak-ng` synthesizer, providing spoken feedback at the console/TTY level — useful for accessibility before a graphical session starts, or in a minimal/recovery environment where Orca isn't available.

```bash
# Check espeakup status
systemctl status espeakup
```

## Braille Displays — brltty

**brltty** provides braille display support, translating screen content to a connected refreshable braille display and relaying input from the display's controls back to the system. It auto-detects most USB braille displays.

```bash
# Check brltty status and detected displays
systemctl status brltty
brltty -E   # discover devices without starting the daemon
```

## Input Methods — IBus

IBus provides input method support for scripts that need composition (can't be typed with a simple keymap), with several engines pre-installed:

| Engine | Language / Script |
|--------|-------------------|
| `ibus-typing-booster` | Predictive typing / autocomplete for any language |
| `ibus-libpinyin` | Chinese (Pinyin) |
| `ibus-anthy` | Japanese |
| `ibus-hangul` | Korean |
| `ibus-unikey` | Vietnamese |

**Enabling an input method:**
- GNOME: Settings → Keyboard → Input Sources → Add an Input Source, then select the language
- KDE Plasma: System Settings → Input Devices → Virtual Keyboard, or Regional Settings → Input Method

Switch between input sources with the keyboard shortcut shown in Settings (typically `Super+Space` on GNOME).

```bash
# Check IBus is running
ibus-daemon --version
ibus list-engine    # list all available engines
```

For Indic scripts (Devanagari, Bengali, Gujarati, Gurmukhi, Kannada, Malayalam, Oriya, Tamil, Telugu), rendering is handled by pre-configured fontconfig rules and Noto fonts rather than a dedicated IBus engine — see [What's Included](../intro/whats-included.md).

## Other Desktop Accessibility Settings

Beyond the tools above, both desktops expose standard accessibility options that don't require any extra packages:

- **High contrast / large text:** GNOME Settings → Accessibility → Seeing; KDE System Settings → Appearance → Accessibility
- **Sticky keys / slow keys / bounce keys:** GNOME Settings → Accessibility → Typing; KDE System Settings → Input Devices → Keyboard → Accessibility
- **Zoom / magnifier:** GNOME Settings → Accessibility → Zoom; KDE System Settings → Accessibility → Screen Magnifier

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Orca doesn't start | Confirm AT-SPI is enabled: `gsettings get org.gnome.desktop.interface toolkit-accessibility` (GNOME); should be `true` |
| No sound from espeakup | Check `systemctl status espeakup`; confirm `espeak-ng` voices are installed (`espeak-ng --voices`) |
| Braille display not detected | Check `brltty -E` output and USB connection; some displays need a specific `braille-driver=` setting in `/etc/brltty.conf` |
| IBus input source doesn't appear | Confirm the engine package is installed (`ibus list-engine`); log out and back in after adding a new input source |

## See Also

- [What's Included](../intro/whats-included.md) — full font and language support list
- [Hardware](hardware) — general USB device detection
- [User Configuration](../intro/user-config.md) — per-user settings and provisioning
- [Accessibility on Shani OS](https://blog.shani.dev/post/shani-os-accessibility) — extended walkthrough covering magnification, high contrast, and keyboard accessibility
- [Indian Language Support on Shani OS](https://blog.shani.dev/post/shani-os-indian-language-support) — Indic script rendering and fonts

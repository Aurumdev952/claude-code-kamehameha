<div align="center">

# ⚡ KAMEHAMEHA ⚡

### Your Claude Code context window, as a pixel-art beam struggle.

<img src="assets/demo.gif" alt="A pixel hero laughs off a thin kamehameha, then strains as it grows, then falls: GAME OVER, PLEASE COMPACT" width="512">

**A [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview) that turns context usage into a fight you can feel.**
At 5% the hero laughs. At 80% they're screaming. At 95% it's **GAME OVER**, so please `/compact`.

![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.287%2B-d97757?style=flat-square)
![Mod](https://img.shields.io/badge/type-mod-8a3cff?style=flat-square)
![Tokens](https://img.shields.io/badge/token%20cost-0-2fa8ff?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-ffd23f?style=flat-square)

</div>

---

## 🎮 Install

Paste this at the prompt of a Claude Code terminal session:

```
/plugin install kamehameha --marketplace Aurumdev952/claude-code-kamehameha
```

Answer `y` to add the marketplace, pick a scope (user is the default), and you're done. No restart is needed.
To see the whole fight right away, run:

```
/kamehameha demo
```

## 🥊 The stages

As your context fills, the beam swells and the hero gets pushed back.

<img src="assets/stages.png" alt="Six stages: laughing, barely warm, bracing, straining, one knee down, game over" width="100%">

| Context | Hero | What you see |
|:-:|---|---|
| **0–24%** | 😂 *"HA HA HA! Is that all you've got?"* | Thin beam, hands on hips, a bouncing pixel **HA HA** |
| **25–49%** | 😏 *"Meh. Barely warm."* | Arms crossed, smirking, the beam starting to wobble |
| **50–74%** | 😬 *"Ngh... okay, that's getting strong!"* | Arms out, golden aura, sweat, sparks, and the sky turns red |
| **75–89%** | 😫 *"AAARGH! Can't... hold... much longer!"* | Crouched, gritted teeth, a huge beam and **screen shake** |
| **90–94%** | 😱 *"/compact... NOW...!"* | Down on one knee and being shoved backwards |
| **95%+** | 💀 **GAME OVER** | A white-out explosion, the hero down and smoking, and blinking **GAME OVER / PLEASE COMPACT** in pixel type |

Run `/compact` and the hero gets back up 🎉

## ⌨️ Commands

| Command | Does |
|---|---|
| `/kamehameha` | Open the showdown pane |
| `/kamehameha demo` | Play the whole fight from 0% to GAME OVER (about 20 s) |
| `/kamehameha 80` | Preview any percentage |
| `/kamehameha live` | Go back to your real context usage |

You also get:
- a **usage bar** under the art: `████████░░░░ 71%  142k / 200k`
- a **status line** warning from 75%
- a **toast** when the hero falls, and another when they get back up after `/compact`

## 🔬 How it works

```
session.measure ──► context % ──► stage (laugh → relaxed → brace → strain → knee → dead)
                                    │
                  $.clock.every(100ms)
                                    ▼
          paint(): sky, fighter, hero, beam, flare, sparks, pixel font
                                    ▼
         encode(): 2 pixels per cell with '▀' (fg = top, bg = bottom)
                                    ▼
             $.ui.blit() ──► a Raster in a pane beside the transcript
```

- **Zero tokens.** It reads the same context figures as the status line (`session.measure` / `$.session.usage()`) and never calls the model.
- **Real pixel art in the terminal.** Each terminal cell holds two square-ish pixels by using the upper-half-block `▀` with true-color foreground and background, repainted in place at about 10 fps.
- **Hand-drawn sprites and a 3×5 pixel font**, all in [`hooks/scene.ts`](hooks/scene.ts), with no image assets.
- **Tiny footprint.** No network, no processes, no file writes. Mods run with your permissions, so check that claim: `claude plugin validate` lists every call it makes:

```
❯ calls: $.clock.every, $.command.register, $.session.usage, $.ui.blit,
         $.ui.invalidate, $.ui.open, $.ui.resolve, $.ui.status, $.ui.toast
```

## 📐 Requirements

- **Claude Code 2.1.287+**, the first version with mods
- A **true-color terminal** such as Ghostty, kitty, WezTerm, iTerm2 or Windows Terminal
- The pane opens on its own when the terminal is at least **144 columns** wide. Otherwise type `/kamehameha`.
- In the desktop app's Code tab you get the caption and usage bar without the pixel art, because `Raster` is terminal-only for now.

## 🛠️ Hack on it

```bash
git clone https://github.com/Aurumdev952/claude-code-kamehameha
claude --plugin-dir ./claude-code-kamehameha     # run it from source

claude plugin validate ./claude-code-kamehameha  # what it hooks and calls
claude plugin test ./claude-code-kamehameha      # stage + rendering tests
```

| File | What's inside |
|---|---|
| [`hooks/register.tsx`](hooks/register.tsx) | Hooks: context tracking, the pane, the animation loop, the command, toasts |
| [`hooks/scene.ts`](hooks/scene.ts) | The renderer: sprites, beam physics (well, sines), explosion, pixel font, cell encoding |
| [`hooks/scene.test.ts`](hooks/scene.test.ts) | Tests: stage thresholds, the beam grows, GAME OVER only at 95%, cell packing |

Ideas welcome: new heroes, a rival beam from the hero at high %, sound effects with `$.audio.play`, or a 9000+ easter egg 👀

## ⚖️ Disclaimer

An unofficial fan homage. It isn't affiliated with or endorsed by the owners of *Dragon Ball*. All sprites are original pixel art drawn for this mod.

## 📄 License

[MIT](LICENSE)

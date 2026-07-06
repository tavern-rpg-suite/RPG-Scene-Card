# RPG Scene Card

A compact **scene card** rendered at the **top of every character message** — the in-world date & weather, the time span of the scene, where you are, one fitting recollection, and the NPCs present — written by a **secondary model** kept separate from your main roleplay model, so it never eats into your story context.

**Version 1.4.2** 

---

## ✨ Features

- 🗞️ **At-a-glance scene header** on each reply, in a clean paper style.
- 🧠 **Secondary model** — its own OpenAI-compatible URL / key / model / temperature, independent of your main model.
- 🎚️ **Toggle every field**: 🗓️ date & weather · ⏳ time (start → end) · 📍 location · 👥 present characters · ⭐ level.
- 👤 **Character read-outs** — each present NPC gets an emoji, name, a short visible physical state and one behaviour cue (never you, the player).
- ⏳ **Continuity guard** — keeps the date, weather and location steady from message to message; normally only the time nudges forward, unless the scene clearly changes day, place or weather. No random new years or teleports.
- 💉 **Optional injection** into your main model at an adjustable depth, so the story stays anchored to the same time and place.
- ✏️ **Fully editable prompt** with a reset button, and **inline-editable** fields on each box.
- 🌍 **English / Русский** interface *and* generated output.
- 💾 Cached per message and restored on reload.

## 📦 Install

Copy the `RPG Scene Card` folder into your third-party extensions folder (e.g. `SillyTavern/data/<user>/extensions/`), reload (**Ctrl+F5**), and enable it under **Extensions → RPG Scene Card**.

## ⚙️ Setup

1. Enable the extension and pick a **Language**.
2. Fill in the **secondary** API **URL / Key / Model** (default `google/gemma-4-31b-it`) and a temperature.
3. Choose how many **recent messages** to analyse (default 10) and flip on just the fields you want.
4. Optionally turn on **inject into the main model** and set its depth.

## 🧠 How it works

After each character reply the secondary model reads the last few messages and returns a small structured summary, which is rendered as the box and cached. Because it's a *separate* model, the analysis never competes with your roleplay model's context. With injection on, that same summary is quietly handed to your main model so it keeps the scene's time, place and weather consistent.

## 🩺 Troubleshooting

- **Box is empty or shows an error.** Check the secondary **URL / key / model**; the box needs its own working endpoint.
- **The date/weather keeps drifting.** Keep the continuity line in the prompt (it tells the model to hold date/weather/location steady) — the reset button restores it.
- **Nothing reaches my main model.** Turn on injection and set a depth ≥ 0.

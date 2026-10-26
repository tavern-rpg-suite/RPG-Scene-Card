# RPG Scene Card

<p>
<img width="1672" height="941" alt="0cdd09ca-e799-4a05-bb40-695a7211c79a (1)" src="https://github.com/user-attachments/assets/cb31d7a8-bc83-4985-b82d-c03b8a8157f1" />
</p>

A compact **scene card** rendered at the **top of every character message** — the in-world date & weather, the time span of the scene, where you are, one fitting recollection, and the NPCs present — written by a **secondary model** kept separate from your main roleplay model, so it never eats into your story context.

**Version 1.5.5** 

---

## ✨ Features

<img width="676" height="220" alt="Screenshot_3" src="https://github.com/user-attachments/assets/51bddc54-36ff-4a44-a972-d41af0c424b8" />



- 🗞️ **At-a-glance scene header** on each reply, in a clean paper style.
- 🧠 **Secondary model** — its own OpenAI-compatible URL / key / model / temperature, independent of your main model.
- 🎚️ **Toggle every field**: 🗓️ date & weather · ⏳ time (start → end) · 📍 location · 👥 present characters · ⭐ level.
- 👤 **Character read-outs** — each present NPC gets an emoji, name, a short visible physical state and one behaviour cue (never you, the player).
- ⏳ **Continuity guard** — keeps the date, weather and location steady from message to message; normally only the time nudges forward, unless the scene clearly changes day, place or weather. No random new years or teleports.
- 💉 **Optional injection** into your main model at an adjustable depth, so the story stays anchored to the same time and place.
- ✏️ **Fully editable prompt** with a reset button, and **inline-editable** fields on each box.
- 🧩 **Custom fields** — add your own lines to the card (emoji, label, a hint for the model). Two examples come built in: 🌍 *The Living World* — one slow-burning event in the wider world — and ⭐ *Level*.
<img width="495" height="591" alt="Screenshot_4" src="https://github.com/user-attachments/assets/fadec32f-5a6d-428f-b043-44ec043d0554" />
- 🌍 **English / Русский** interface *and* generated output.
- 💾 Cached per message and restored on reload.

## 🌦️ Weather & Atmosphere

Off by default — **Show weather over the chat** in *Weather & atmosphere*.

The card already knows the weather, the time and the place — this turns them into a living layer over the chat:

- 🌧️ **Weather** — rain, storms with lightning, snow, fog, wind gusts; light or heavy, as the card says.
- 🌅 **Light** — the colour of dawn, day, dusk and night, from the card's time.
- 🏰 **Place** — indoors or outdoors from the location (or always one of them), and a tint by place: castle, tavern, clinic, forest, sea, underground. Dust in a sunbeam, embers by a hearth.
- 🎚️ **Strength** slider and an **Animate** switch.

## 🕰️ Time Mode — In-world or Real

- **In-world** (default) — the model keeps the story's own date and time.
- **Real (companion)** — the date and time of this device, and the **real weather** for your city (search by name, or *use this device's location*); °C or °F. The character can also be told **how long the pause** before your message was. With no API key the card still shows the real date, time and weather.

Weather data: [Open-Meteo.com](https://open-meteo.com) (CC BY 4.0) — free, no key needed.

## 🔗 Works with the suite

- **RPG Diary** — follows the card's day: a new in-game day brings a new diary entry (or a summary, as you set it there).
- **RPG Map** — the card can be given the map's room names, so the location matches a real room; the map follows the card's location, clock and present characters (*Who is where*, routines, the off-screen chronicle).
- **RPG Living Scene** — reads who is present from the card.

## 📦 Install

Copy the `RPG Scene Card` folder into your third-party extensions folder (e.g. `SillyTavern/data/<user>/extensions/`), reload (**Ctrl+F5**), and enable it under **Extensions → RPG Scene Card**.

## ⚙️ Setup

1. Enable the extension and pick a **Language**.
2. Fill in the **secondary** API **URL / Key / Model** (default `google/gemma-4-31b-it`) and a temperature.
3. Choose how many **recent messages** to analyse (default 10) and flip on just the fields you want.
4. Optionally turn on **inject into the main model** and set its depth.

## 🧠 How it works

After each character reply the secondary model reads the last few messages and returns a small structured summary, which is rendered as the box and cached. Because it's a *separate* model, the analysis never competes with your roleplay model's context. With injection on, that same summary is quietly handed to your main model so it keeps the scene's time, place and weather consistent.

---
## ✨ Screenshots

<img width="1901" height="867" alt="Preview-RPG Scene Card" src="https://github.com/user-attachments/assets/80560cb4-b5ed-411e-a233-a167674bde63" />

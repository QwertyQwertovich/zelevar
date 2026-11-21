# Potion Brewer · Зельевар

A cozy sorting puzzle: pour potions between flasks until every color sits in its own flask.

**▶ Play in the browser:** https://qwertyqwertovich.github.io/zelevar/
**📱 Android (APK):** [latest release](https://github.com/QwertyQwertovich/zelevar/releases/latest)

## Features

- **1000 levels**, every one verified by a solver — each level is guaranteed to be solvable without extra flasks
- **21 mechanics and modes**, introduced one by one and combined later: secret layers, frozen flasks, funnels, locks, tall flasks, stones, dark levels, filters, wax seals, taps, narrow necks, heavy potions, customer orders, cauldrons, unstable potions, frozen layers, cracked and mirror flasks, plus blitz and move-limited recipe modes
- **10 chapters** with their own scenery, from the Herbalist’s shop to the Archmage’s castle
- **Bul**, a little living flask who cheers you on
- **Design shop**: backgrounds (including animated ones), flask shapes, potion styles, corks, effects, palettes (with a colorblind-friendly one), sounds, particles, victory effects and selection styles — all for stars, with free try-on
- **Daily gift, Potion of the Day and 24 achievements**
- **Level generator** after level 1000: pick colors, difficulty, mode and mechanics
- **Save codes**: copy your progress and restore it on any device, in the app or on the website
- **Works offline**, installs as a web app, no ads, no tracking
- **8 languages**: English, Русский, Українська, Deutsch, Français, Español, Português, 中文

## How to play

Tap a flask, then another one — the top layer pours over if the target is empty or has the same color on top. Collect each color in its own flask. Undo is free for the first 3 moves of each attempt.

## Under the hood

Plain HTML, CSS and JavaScript — no frameworks, no build step. The Android app is a tiny WebView wrapper around the same files. Levels are generated offline and checked by a depth-first solver that replays every solution move by move.

---

## По-русски

Уютная головоломка-сортировка: разливайте зелья по колбам, пока каждый цвет не окажется в своей колбе. 1000 проверенных уровней, 21 механика, 10 глав, лавка дизайнов, генератор уровней, работает без интернета и без рекламы, 8 языков.

# LiveChat

> Application desktop pour streamers : récupère des médias (vidéos, images, liens) depuis un salon Discord et les affiche en direct sur OBS via un overlay transparent.

[![CI](https://github.com/Grahaam/discord-obs-overlay/actions/workflows/ci.yml/badge.svg)](https://github.com/Grahaam/discord-obs-overlay/actions/workflows/ci.yml)

---

## Sommaire

- [Installation rapide (recommandé)](#installation-rapide-recommandé)
- [Premier lancement](#premier-lancement)
- [Configuration OBS](#configuration-obs)
- [Tester une alerte](#tester-une-alerte)
- [Installation depuis les sources](#installation-depuis-les-sources)
- [Documentation détaillée](#documentation-détaillée)
- [English](#english)

---

## Installation rapide (recommandé)

Téléchargez l'installeur correspondant à votre système depuis la page [Releases](https://github.com/Grahaam/discord-obs-overlay/releases) :

| Système | Fichier |
|---------|---------|
| Windows | `LiveChat-Setup-2.0.0.exe` (NSIS) |
| macOS (Apple Silicon) | `LiveChat-2.0.0-arm64.dmg` |
| macOS (Intel) | `LiveChat-2.0.0-x64.dmg` |
| Linux | `LiveChat-2.0.0.AppImage` |

Aucune installation de Node.js, `yt-dlp` ou `ffmpeg` n'est requise — tout est embarqué.

## Premier lancement

1. Lancez **LiveChat**. Une fenêtre d'assistant s'ouvre.
2. Collez votre **Token de bot Discord** et l'**ID du salon textuel** à surveiller.
3. Cliquez sur **Terminer**. Le tableau de bord s'ouvre.

L'application reste accessible via une icône dans la barre des tâches. Fermer la fenêtre la masque dans la barre — utilisez **Quitter** depuis le menu de l'icône pour fermer totalement.

> Pas de bot Discord ? Voir [docs/CONFIG.md](docs/CONFIG.md#créer-un-bot-discord).

## Configuration OBS

1. Dans le tableau de bord, section **Overlay OBS**, copiez l'URL affichée (forme : `http://127.0.0.1:<port>/overlay`).
2. Dans OBS Studio, ajoutez une **Source navigateur**.
3. Collez l'URL, réglez la taille à `1920×1080` (ou votre résolution de stream).
4. Cochez **Arrière-plan transparent**.

Détails : [docs/OBS-SETUP.md](docs/OBS-SETUP.md).

## Tester une alerte

Tableau de bord → bouton **Tester l'alerte**. L'overlay doit afficher l'alerte de démonstration.

---

## Installation depuis les sources

Pour le développement ou un build personnalisé.

**Prérequis :** Node.js ≥ 22, npm.

```bash
git clone https://github.com/Grahaam/discord-obs-overlay.git
cd discord-obs-overlay
npm install
npm run build
npm start
```

Mode développement (HMR) :

```bash
npm run dev
```

Lancer l'app Electron en dev :

```bash
npm run electron:dev
```

Builds installeurs :

```bash
npm run electron:build:win    # NSIS
npm run electron:build:mac    # DMG x64 + arm64
npm run electron:build:linux  # AppImage
```

## Documentation détaillée

- [docs/INSTALL.md](docs/INSTALL.md) — installeurs par OS, mises à jour
- [docs/CONFIG.md](docs/CONFIG.md) — bot Discord, cookies YouTube, mots bannis, NSFW
- [docs/OBS-SETUP.md](docs/OBS-SETUP.md) — source navigateur, audio, dimensions
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — erreurs courantes
- [CHANGELOG.md](CHANGELOG.md) — historique des versions

---

## English

LiveChat is a desktop app for streamers. It picks up media (videos, images, links) posted in a Discord channel and plays them live on OBS through a transparent browser-source overlay.

### Quick install

Download the installer for your OS from [Releases](https://github.com/Grahaam/discord-obs-overlay/releases): Windows NSIS, macOS DMG (Apple Silicon + Intel), or Linux AppImage. No Node.js / yt-dlp / ffmpeg required — everything is bundled.

### First run

Launch LiveChat → the setup wizard asks for your **Discord bot token** and **channel ID** → finish → the dashboard opens. The app lives in the system tray; closing the window hides it there.

### OBS

Copy the overlay URL from the dashboard (`http://127.0.0.1:<port>/overlay`), add it as a **Browser Source** in OBS, size `1920×1080`, transparent background.

### From source

```bash
npm install
npm run build
npm start              # standalone server
npm run electron:dev   # Electron shell
```

See [docs/INSTALL.md](docs/INSTALL.md), [docs/CONFIG.md](docs/CONFIG.md), [docs/OBS-SETUP.md](docs/OBS-SETUP.md), [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

---

## Licence

Voir le dépôt. Sources fournies.

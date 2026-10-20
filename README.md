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
- [Ancienne version en ligne de commande](#ancienne-version-en-ligne-de-commande)
- [Documentation détaillée](#documentation-détaillée)
- [English](#english)

---

## Installation rapide (recommandé)

Téléchargez l'installeur correspondant à votre système depuis la page [Releases](https://github.com/Grahaam/discord-obs-overlay/releases) :

| Système               | Fichier                           |
| --------------------- | --------------------------------- |
| Windows               | `LiveChat-Setup-2.0.0.exe` (NSIS) |
| macOS (Apple Silicon) | `LiveChat-2.0.0-arm64.dmg`        |
| macOS (Intel)         | `LiveChat-2.0.0-x64.dmg`          |
| Linux                 | `LiveChat-2.0.0.AppImage`         |

Aucune installation de Node.js, `yt-dlp` ou `ffmpeg` n'est requise — tout est embarqué.

**Désinstaller :** Paramètres Windows → Applications → **LiveChat** → Désinstaller. Le désinstalleur demande s'il faut aussi supprimer vos données (`%APPDATA%LiveChat` : réglages, token du bot Discord, mot de passe OBS, cookies, cache). Répondez **Oui** pour tout effacer, ou **Non** pour les garder en vue d'une réinstallation.

## Premier lancement

1. Lancez **LiveChat**. Un assistant en 3 étapes s'ouvre :
   1. **Créer votre bot** : il vous guide dans le Portail Développeur Discord (sans oublier **Message Content Intent**).
   2. **Coller le token** : le bot se connecte, puis le bouton **Inviter le bot sur mon serveur** l'ajoute à votre serveur.
   3. **Choisir le salon** dans la liste. Les salons que le bot ne peut pas lire sont grisés, avec la raison.
2. Cliquez sur **Terminer**. Le tableau de bord s'ouvre avec une **liste de vérification** qui coche chaque étape au fur et à mesure (bot, overlay dans OBS, connexion OBS, alerte de test). Vous pouvez la rouvrir depuis l'en-tête du tableau de bord.

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

## Ancienne version en ligne de commande

Avant la 2.0.0, LiveChat s'installait avec `install.bat` / `install.sh` puis se lançait avec `launch.bat` / `launch.sh`, dans une fenêtre de commande. Cette version n'est plus maintenue, mais elle reste disponible :

- **Dernière version script : [v1.9.5](https://github.com/Grahaam/discord-obs-overlay/releases/tag/v1.9.5)** sur la page Releases. Elle ne reçoit plus de mises à jour.
- Les scripts sont toujours dans le dépôt et lancent le même serveur que l'application (`npm start`), sans fenêtre ni icône système. Voir [Installation depuis les sources](#installation-depuis-les-sources).

Pour la plupart des streamers, l'installeur est plus simple : rien à installer à côté, mises à jour automatiques sur Windows et Linux.

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

## Pose « Absolute Cinema »

L'overlay peut détecter quand vous faites la pose « Absolute Cinema » (les deux mains levées, bras écartés) et afficher une image avec un son.

1. Dans OBS : **Outils → Paramètres du serveur WebSocket**, activez le serveur (port 4455) et désactivez l'authentification.
2. Déposez votre image et votre son dans le dossier `user-assets/` (par défaut `absolute-cinema.jpg` et `absolute-cinema.mp3`).
3. Dans l'onglet Bot Discord, activez la détection et indiquez le nom exact de votre source webcam dans OBS.
4. Rechargez la source navigateur de l'overlay.

La détection tourne localement dans l'overlay (MediaPipe, aucune image n'est envoyée en ligne). Elle capture la source webcam via obs-websocket, donc la caméra n'a pas besoin d'être partagée avec une autre application. Le modèle est téléchargé dans `models/` lors du `npm install`.

---

## English

LiveChat is a desktop app for streamers. It picks up media (videos, images, links) posted in a Discord channel and plays them live on OBS through a transparent browser-source overlay.

### Quick install

Download the installer for your OS from [Releases](https://github.com/Grahaam/discord-obs-overlay/releases): Windows NSIS, macOS DMG (Apple Silicon + Intel), or Linux AppImage. No Node.js / yt-dlp / ffmpeg required — everything is bundled.

**Uninstall:** Windows Settings → Apps → **LiveChat** → Uninstall. The uninstaller asks whether to also delete your data (`%APPDATA%LiveChat`: settings, Discord bot token, OBS password, cookies, cache): **Yes** removes everything, **No** keeps it for a reinstall.

### First run

Launch LiveChat → the setup wizard walks you through creating your **Discord bot**, pasting its **token**, inviting it to your server and **picking the channel** → finish → the dashboard opens. The app lives in the system tray; closing the window hides it there.

### OBS

Copy the overlay URL from the dashboard (`http://127.0.0.1:<port>/overlay`), add it as a **Browser Source** in OBS, size `1920×1080`, transparent background.

### From source

```bash
npm install
npm run build
npm start              # standalone server
npm run electron:dev   # Electron shell
```

**Legacy command-line version:** before 2.0.0, LiveChat was installed with `install.bat` / `install.sh` and run with `launch.bat` / `launch.sh`. That version is no longer maintained; the last one is [v1.9.5](https://github.com/Grahaam/discord-obs-overlay/releases/tag/v1.9.5). The scripts are still in the repo and run the same server as the app (`npm start`), without a window or tray icon.

See [docs/INSTALL.md](docs/INSTALL.md), [docs/CONFIG.md](docs/CONFIG.md), [docs/OBS-SETUP.md](docs/OBS-SETUP.md), [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

---

## Licence

Voir le dépôt. Sources fournies.

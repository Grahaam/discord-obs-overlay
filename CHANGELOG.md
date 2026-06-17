# Changelog

Toutes les modifications notables sont listées ici. Format : [Keep a Changelog](https://keepachangelog.com/fr/), versions : [SemVer](https://semver.org/lang/fr/).

## [2.0.0] — 2026-06-12

> **Version majeure.** Le produit est renommé, le mode d'installation recommandé change, et les données utilisateur déménagent en mode packagé. Voir [Migration depuis 1.9.x](#migration-depuis-19x).

### Breaking changes

- **Renommage produit** : `discord-obs-overlay` / "StreamAlerts Hub" → **LiveChat**.
- **Emplacement des données** : en mode Electron packagé, `settings.json`, `.env`, `cookies.txt` et `media_cache/` sont désormais sous le dossier de données utilisateur de l'OS (`%APPDATA%\LiveChat\`, `~/Library/Application Support/LiveChat/`, `~/.config/LiveChat/`), pas dans le dossier d'installation. Le mode standalone (`npm start`) garde l'ancien comportement (cwd).
- **Node 22 minimum** pour builds depuis les sources (était : ≥ 18).
- **Mode d'installation principal** : installeurs Electron (NSIS / DMG / AppImage). Le mode `npm start` reste supporté pour les développeurs.

### Migration depuis 1.9.x

Si vous utilisiez `npm start` et passez à l'installeur Electron :

1. Quittez l'ancienne version.
2. Installez LiveChat 2.0.0.
3. Copiez `settings.json`, `.env`, `cookies.txt` du dossier du dépôt vers le dossier de données utilisateur (voir [docs/INSTALL.md](docs/INSTALL.md)).
4. Lancez LiveChat — l'assistant détecte la config existante et l'utilise.

Si vous restez en mode source (`npm start`) : aucune action requise, vos fichiers restent en place.

### Highlights

- **Application desktop** : nouveau shell Electron avec installeurs Windows (NSIS), macOS (DMG x64 + arm64) et Linux (AppImage).
- **yt-dlp embarqué** : binaire PyInstaller standalone livré avec l'app et auto-mis-à-jour via `yt-dlp -U` (mode packagé uniquement ; installations source pip/brew/apt restent gérées par l'utilisateur). Plus besoin d'installation système.
- **Assistant de premier lancement** : configuration token + salon dans une fenêtre dédiée.
- **Icône système** : LiveChat tourne en tray, fermer la fenêtre la masque.

### Added

- Shell Electron (`electron/main.cjs`) : fork du serveur via `utilityProcess`, sélection de port 3000–3099, attente de `/api/health`, BrowserWindow + tray.
- Premier lancement : `wizard.html` capture token et channel ID avant d'ouvrir le tableau de bord.
- Single-instance lock : empêche deux instances de LiveChat de tourner simultanément.
- Récupération automatique après crash serveur.
- Badge d'état "préchauffe du moteur média" dans l'UI.
- Téléchargement + warm-up `yt-dlp` standalone en arrière-plan, bloque la file d'attente média le temps de préparer le binaire.
- `APP_PATHS` : résolution séparée des ressources app (lecture seule) et des données utilisateur (lecture/écriture) selon le mode (Electron packagé vs dev).
- Génération d'icônes app + tray via script pure-Node.
- CI : workflow E2E Playwright sur ubuntu-latest + windows-2022.

### Changed

- `package.json` : `name` = `livechat`, `productName` = `LiveChat`, `appId` = `com.livechat`.
- Node 22 requis (CI + workflows release).
- `mediaParser` : résolution des médias sans extension via `Content-Type` avant fallback yt-dlp.
- `mediaParser` : extraction YouTube via stratégie multi-client yt-dlp.
- Vite dev : exclusion de `dist/`, `media_cache/`, `overlay.db*` du watcher.

### Fixed

- Token invalide détecté et signalé pendant l'assistant de premier lancement (avant ouverture du tableau de bord).
- `main.cjs` : `require()` au lieu de `import` ESM (compat Electron CommonJS).
- Crash overlay E2E corrigé.
- `better-sqlite3` rebuild contre l'ABI Node lors de l'install CI.
- yt-dlp self-update appliqué au binaire actif, pas à la copie vendored.
- yt-dlp self-update sauté pour les installations gérées par un package manager système.
- `console.error` guard restauré au sortie du serveur.

### Removed

- Ancien nom "StreamAlerts Hub" / "discord-obs-overlay" des références utilisateur.

---

## Versions antérieures

Voir l'historique git : `git log v1.9.5` et tags précédents (`v1.9.0` à `v1.9.5`).

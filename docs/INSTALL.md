# Installation

## Windows

1. Téléchargez `LiveChat-Setup-2.0.0.exe` depuis [Releases](https://github.com/Grahaam/discord-obs-overlay/releases).
2. Double-cliquez. SmartScreen peut afficher un avertissement ("Windows a protégé votre PC") car le binaire n'est pas signé — cliquez sur **Informations complémentaires** → **Exécuter quand même**.
3. Suivez l'assistant NSIS. Par défaut, installation dans `%LOCALAPPDATA%\Programs\LiveChat`.
4. Données utilisateur : `%APPDATA%\LiveChat\` (`settings.json`, `.env`, `cookies.txt`, `media_cache/`).

## macOS

1. Téléchargez le DMG correspondant à votre puce :
   - Apple Silicon (M1/M2/M3) : `LiveChat-2.0.0-arm64.dmg`
   - Intel : `LiveChat-2.0.0.dmg`
2. Ouvrez le DMG, glissez **LiveChat.app** dans **Applications**.
3. Premier lancement : clic-droit sur l'app → **Ouvrir** (Gatekeeper bloque le double-clic car l'app n'est pas notarisée).
4. Données utilisateur : `~/Library/Application Support/LiveChat/`.

## Linux

1. Téléchargez `LiveChat-2.0.0.AppImage`.
2. Rendez le fichier exécutable :
   ```bash
   chmod +x LiveChat-2.0.0.AppImage
   ```
3. Lancez :
   ```bash
   ./LiveChat-2.0.0.AppImage
   ```
4. Données utilisateur : `~/.config/LiveChat/`.

> **Dépendance système Linux :** `libfuse2` requis pour les AppImages. Installez via `sudo apt install libfuse2` (Debian/Ubuntu) si le lancement échoue.

## Mise à jour

Téléchargez l'installeur de la nouvelle version et relancez-le par-dessus l'ancienne installation. Vos données (`settings.json`, `.env`, base SQLite) sont conservées car stockées hors du dossier d'installation.

## Désinstallation

- **Windows** : Panneau de configuration → Programmes → LiveChat → Désinstaller.
- **macOS** : déplacez `LiveChat.app` à la Corbeille.
- **Linux** : supprimez le fichier `.AppImage`.

Données utilisateur conservées par défaut. Pour purge complète, supprimez aussi le dossier listé ci-dessus.

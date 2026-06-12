# Configuration

Tous les réglages se font depuis le tableau de bord. Cette page documente les fichiers sous-jacents pour les utilisateurs avancés.

## Emplacement des fichiers

| Fichier | Rôle |
|---------|------|
| `settings.json` | Config UI, ID salon, mots bannis, options overlay |
| `.env` | `DISCORD_TOKEN` uniquement |
| `cookies.txt` | Cookies YouTube (format Netscape) pour vidéos privées/restreintes |
| `media_cache/` | Médias téléchargés (limite 2 Go, TTL 24 h) |
| `overlay.db` | Historique alertes + logs (SQLite WAL) |

Localisation par OS : voir [INSTALL.md](INSTALL.md).

## Créer un bot Discord

1. Allez sur https://discord.com/developers/applications.
2. **New Application** → nommez-la (ex. "LiveChat Bot") → **Create**.
3. Onglet **Bot** → **Reset Token** → copiez le token (à coller dans LiveChat).
4. Sous **Privileged Gateway Intents**, activez **MESSAGE CONTENT INTENT**.
5. Onglet **OAuth2 → URL Generator** :
   - Scopes : `bot`
   - Bot Permissions : `Read Messages/View Channels`, `Read Message History`
   - Copiez l'URL générée → ouvrez-la → ajoutez le bot à votre serveur.

## Récupérer l'ID d'un salon Discord

1. Discord → **Paramètres utilisateur → Avancés → Mode développeur** : activer.
2. Clic-droit sur le salon textuel → **Copier l'identifiant du salon**.

## Cookies YouTube (`cookies.txt`)

Pour télécharger des vidéos YouTube privées, en âge restreint ou nécessitant une connexion :

1. Installez une extension navigateur d'export de cookies (ex. **Get cookies.txt LOCALLY**).
2. Connectez-vous à YouTube, exportez les cookies au format **Netscape**.
3. Placez le fichier sous le nom `cookies.txt` dans le dossier de données utilisateur.

Redémarrez LiveChat pour que `yt-dlp` les utilise.

## Mots bannis

Tableau de bord → **Filtres**. Deux modes :

- **Bloquer** : l'alerte est ignorée si le message contient un mot banni.
- **Censurer** : le mot est remplacé par `***`, l'alerte continue.

## Limites de taille

| Type | Limite dur (code) | Limite utilisateur (UI) |
|------|------------------|------------------------|
| Image | 10 Mo | configurable via `mediaMaxSizeMB` |
| Vidéo | 50 Mo | configurable via `mediaMaxSizeMB` |

La limite UI ne peut pas dépasser la limite dur.

## Variables d'environnement

| Variable | Défaut | Effet |
|----------|--------|-------|
| `DISCORD_TOKEN` | — | Token du bot (obligatoire) |
| `PORT` | auto (3000–3099) | Force un port spécifique (mode standalone) |
| `NODE_ENV` | `production` | `development` active Vite HMR |

En mode Electron, le port est choisi automatiquement parmi les libres entre 3000 et 3099 ; `PORT` est ignoré.

# Dépannage

## Le bot ne se connecte pas

**Symptôme :** statut bot = "Déconnecté", logs : `Invalid token`.

- Vérifiez le token dans le tableau de bord → **Bot Discord → Token**.
- Régénérez le token depuis https://discord.com/developers/applications (onglet Bot → **Reset Token**).
- Vérifiez que **MESSAGE CONTENT INTENT** est activé sur l'application.

## Aucune alerte n'arrive

1. **Bot en ligne ?** Voyez le statut dans le tableau de bord.
2. **Bon salon ?** Vérifiez l'ID dans **Bot Discord → Salon**.
3. **Bot dans le serveur ?** Le bot doit être invité et avoir les permissions `View Channel` + `Read Message History`.
4. **Mots bannis trop stricts ?** Tableau de bord → **Filtres** → testez sans liste.

## L'overlay reste noir / vide dans OBS

- L'URL doit pointer vers `/overlay`, pas vers `/`.
- Vérifiez que LiveChat tourne (icône dans la barre des tâches).
- Cliquez-droit sur la source navigateur → **Actualiser**.

## Port déjà utilisé

LiveChat sonde 3000–3099. Si tout est occupé, fermez les autres apps ou changez `PORT` (mode standalone uniquement).

## Vidéo YouTube refuse de télécharger

- **Vidéo privée / âge restreint :** ajoutez un `cookies.txt` (voir [CONFIG.md](CONFIG.md#cookies-youtube-cookiestxt)).
- **Erreur "Sign in to confirm" :** YouTube détecte trop de requêtes anonymes — utilisez `cookies.txt`.
- **yt-dlp obsolète :** LiveChat s'auto-met-à-jour au démarrage. Forcez : fermez l'app, supprimez le binaire dans le dossier de données utilisateur, relancez.

## Fichier trop volumineux

- Limite vidéo dur : 50 Mo. Au-delà, l'alerte est ignorée.
- Limite Discord attachement : ajustable via **Filtres → Taille max média**.

## L'app ne démarre pas (macOS) — "Application endommagée"

Gatekeeper bloque les apps non notarisées. Au terminal :

```bash
xattr -d com.apple.quarantine /Applications/LiveChat.app
```

Puis relancez.

## Logs

Tableau de bord → onglet **Logs** affiche les 1000 dernières lignes. Les logs persistent dans `overlay.db`.

Pour un dump complet : utilisez l'outil **SQLite Browser** sur `overlay.db`.

## Réinitialiser totalement

1. Quittez LiveChat (icône → Quitter).
2. Supprimez le dossier de données utilisateur (voir [INSTALL.md](INSTALL.md)).
3. Relancez : l'assistant de configuration s'ouvre à nouveau.

## Obtenir de l'aide

Ouvrez une issue : https://github.com/Grahaam/discord-obs-overlay/issues — joignez l'OS, la version (visible dans le tableau de bord → À propos) et les logs pertinents.

# Changelog

Toutes les modifications notables sont listées ici. Format : [Keep a Changelog](https://keepachangelog.com/fr/), versions : [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- **Tableau de bord réorganisé** : une barre latérale à six sections (En direct, Modération, Look & son, Poses, Connexions, Système), chacune avec sa propre adresse (`/moderation`, `/look`, `/poses`, `/connections`, `/system`), et une bande d'état toujours visible (bot, OBS, overlay, moteur média).
- **Thème clair** en plus du thème sombre : suit le thème du système, avec un sélecteur dans l'en-tête.
- **Enregistrement automatique** : les réglages s'enregistrent seuls quelques instants après chaque changement, avec une notification « Enregistré ». Le bouton Enregistrer disparaît. Le jeton Discord et le mot de passe OBS gardent un champ « Remplacer » explicite.
- **Poses personnalisées** : nouvel onglet **Poses** dans le tableau de bord. Enregistrez vos propres poses devant la caméra (compte à rebours 3-2-1, capture jusqu'à 10 images nettes), avec le squelette en direct et le pourcentage de correspondance de chaque pose.
- **Poses de mains** : pour chaque doigt, levé / baissé / indifférent (corrigeable après l'enregistrement), plus la position et la direction de la main (👍 ≠ 👎) et l'écart entre les deux mains (🫶, 🙏). Le mode miroir reconnaît aussi l'autre main.
- **Média par pose** : image/GIF + son, ou vidéo, avec volume, durée maximale, plein écran OBS ou non, délai entre deux déclenchements, et prévisualisation sur l'overlay. Les fichiers s'envoient depuis le tableau de bord (plus besoin de les copier dans `user-assets/`).
- Avertissement quand deux poses se ressemblent trop, conseils pour choisir une pose qu'on ne fait pas par hasard, et message clair quand la source caméra n'a pas d'image dans OBS.
- **Calibration des poses** : plusieurs exemples du corps par pose (jusqu'à 6, la plus proche compte), un bouton **Calibrer le seuil** qui observe 8 s de « stream normal » sans la pose et propose un seuil au-dessus de ce que vous faites naturellement, et une ligne « Point faible » (articulation ou doigt le plus éloigné) tant que la pose ne se déclenche pas.

- **Validation avant diffusion** : les alertes des personnes qui ne sont pas encore de confiance sont gardées dans une boîte « À valider » de l'onglet En direct (aperçu du média, texte, auteur) avec **Approuver**, **Refuser** et **Toujours approuver cette personne**. Trois modes dans Modération : personne, nouveaux et sans rôle approuvé (par défaut), tout le monde. Les membres d'un rôle approuvé (choisi dans la liste des rôles de votre serveur) passent directement, et une personne devient de confiance après N alertes approuvées (1 par défaut). Les alertes en attente survivent à un redémarrage, expirent après 30 minutes (réglable), sont comptées en badge dans la barre latérale et le dock OBS, et un refus est consigné dans le journal. Option : réaction ⏳ sur le message Discord, puis ✅ ou ❌ (le lien d'invitation du bot demande maintenant « Ajouter des réactions »).
- L'alerte de test accepte un faux auteur (`asPoster` : identifiant et rôles) pour essayer la validation sans passer par Discord.

### Sécurité

- **Application de bureau durcie** : fenêtres isolées (sandbox), un script de préchargement distinct pour l'assistant de démarrage et pour le tableau de bord, navigation limitée à l'adresse locale (les liens externes s'ouvrent dans le navigateur), caméra autorisée uniquement pour le tableau de bord, et en-tête de sécurité sans `unsafe-eval` ni scripts en ligne en production.
- La base de données attend jusqu'à 5 s si elle est occupée et vide son journal à l'arrêt ; l'intégration continue utilise `npm ci` avec des droits en lecture seule.
- **Clé d'accès locale** : une page web visitée pendant le live ne peut plus piloter LiveChat à votre insu (lire le mot de passe OBS, remplacer le jeton du bot…). Toutes les routes `/api` et les connexions Socket.IO exigent maintenant une clé propre à votre installation, les requêtes qui modifient quelque chose doivent venir de LiveChat lui-même (contrôle `Sec-Fetch-Site` / `Origin`), et les WebSockets d'une autre origine sont refusées.
- **Les URL OBS contiennent désormais `?k=…`** (overlay, dock) : recopiez-les depuis le tableau de bord ou depuis « Copy OBS Overlay URL » dans le menu de l'icône de la zone de notification. La clé est conservée entre deux lancements, donc l'URL ne change plus. Hors Electron, l'adresse complète s'affiche dans la console au démarrage.
- Les corps JSON sont limités à 1 Mo (50 Mo seulement pour l'envoi de médias de pose) et les formulaires `x-www-form-urlencoded` ne sont plus acceptés.

### Modifié

- Par défaut, la première alerte d'une personne sans rôle approuvé attend maintenant votre validation ; choisissez « Personne » dans Modération pour retrouver l'ancien comportement.
- Composants d'interface accessibles (Radix) avec états de focus visibles et libellés ; couleurs, rayons et espacements centralisés dans des variables de thème. L'overlay OBS est inchangé.
- La pose « Absolute Cinema » devient une pose intégrée avec les mêmes réglages ; elle peut être supprimée puis restaurée. Les anciens réglages (image, son, délai) sont repris automatiquement dans `poses.json`.
- Application plus légère : environ 467 Mo installée au lieu de 570 Mo (langues Electron limitées à fr/en, paquets du tableau de bord plus embarqués deux fois, seul le moteur MediaPipe utilisé est fourni).

### Supprimé

- La commande Discord `!troll` : n'importe quel membre du salon pouvait afficher un média en plein écran sur le live.

### Corrigé

- En production, les pages autres que `/` (dont `/overlay`) renvoyaient une erreur quand l'application était installée dans un dossier dont le chemin contient un dossier commençant par un point.

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

### Ancienne version en ligne de commande

La version installée par `install.bat` / `install.sh` et lancée par `launch.bat` / `launch.sh` n'est plus maintenue. **La dernière est [v1.9.5](https://github.com/Grahaam/discord-obs-overlay/releases/tag/v1.9.5)**, qui reste téléchargeable. Les scripts restent dans le dépôt et lancent le même serveur (`npm start`), sans fenêtre ni icône système.

### Highlights

- **Application desktop** : nouveau shell Electron avec installeurs Windows (NSIS), macOS (DMG x64 + arm64) et Linux (AppImage).
- **yt-dlp embarqué** : binaire PyInstaller standalone livré avec l'app et auto-mis-à-jour via `yt-dlp -U` (mode packagé uniquement ; installations source pip/brew/apt restent gérées par l'utilisateur). Plus besoin d'installation système.
- **Assistant de premier lancement guidé** en 3 étapes : création du bot, token puis invitation, choix du salon dans une liste.
- **Liste de vérification** qui coche chaque étape en direct : bot, overlay dans OBS, connexion OBS, alerte de test et cookies (optionnel).
- **Mises à jour automatiques** sur Windows et Linux, depuis les Releases GitHub (macOS : nécessite une version signée, voir [docs/CODE-SIGNING.md](docs/CODE-SIGNING.md)).
- **Pose « Absolute Cinema »** : alerte déclenchée par la webcam via MediaPipe, modèle embarqué.
- **Mot de passe obs-websocket** et port configurables, avec un bouton de test.
- **Icône système** : LiveChat tourne en tray, fermer la fenêtre la masque.

### Added

- Avertissement dans l'onglet Bot quand le bot ne peut pas lire le salon configuré, avec le salon, le serveur, le rôle et la permission manquante.
- Guide pour récupérer les cookies Instagram / TikTok avec un compte jetable, dans une fenêtre privée.
- Arrêt propre à la fermeture : la taille de l'overlay dans OBS est restaurée et la base de données fermée.
- Le port du serveur est conservé d'un lancement à l'autre, pour que l'URL de l'overlay dans OBS reste valide.

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

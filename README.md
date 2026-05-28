# StreamAlerts Hub

StreamAlerts Hub est une application pour les streamers permettant de récupérer des médias (vidéos, images, liens) depuis un salon Discord et de les afficher automatiquement en direct via OBS.

## Prérequis

Assurez-vous d'avoir installé les logiciels suivants sur votre machine :

- **[Node.js](https://nodejs.org/fr/)** (version 18 ou supérieure recommandée)
- Assurez-vous que la commande `npm` est disponible dans votre terminal.

## Installation

1. Ouvrez un terminal dans le dossier du projet.
2. Installez les dépendances :
   ```bash
   npm install
   ```
3. Compilez l'application :
   ```bash
   npm run build
   ```

## Lancement de l'application

Pour démarrer le serveur, utilisez la commande suivante :

```bash
npm start
```

Pour le développement (avec rechargement automatique) :

```bash
npm run dev
```

Le serveur démarrera localement. Vous pourrez accéder au panneau d'administration depuis votre navigateur à l'adresse **http://localhost:3000** (l'URL exacte sera affichée dans le terminal).

## Configuration initiale

Lors de votre première connexion, la page d'accueil vous guidera à travers la configuration :

1. **Liaison Discord** : Allez dans l'onglet Bot Discord. Renseignez l'ID du salon textuel et le Token du Bot.
2. **OBS Studio** : Dans la section Overlay OBS, copiez l'URL fournie.
3. Allez dans OBS, ajoutez une nouvelle **Source Navigateur (Browser Source)**.
4. Collez l'URL.
5. Ajustez la taille (ex: 1920x1080) selon la résolution souhaitée.

## Tester l'overlay

Vous pouvez utiliser le bouton de simulation dans le panneau de configuration pour envoyer une alerte de test sur l'overlay et vérifier le rendu sur OBS.

---

_Fourni avec les sources._

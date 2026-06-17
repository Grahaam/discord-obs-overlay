# Configuration OBS Studio

## Ajouter l'overlay

1. Ouvrez **OBS Studio**.
2. Dans la scène où vous voulez afficher les alertes, **+ → Source navigateur**.
3. Nommez-la `LiveChat Overlay` → **OK**.
4. **URL** : collez celle affichée dans le tableau de bord (forme `http://127.0.0.1:<port>/overlay`).
5. **Largeur** : `1920` — **Hauteur** : `1080` (ajustez à votre résolution de stream).
6. Décochez **Arrêter la source quand non visible** et **Actualiser le navigateur quand la scène devient active** (sinon la connexion Socket.IO se coupe et les alertes peuvent être manquées).
7. **OK**.

L'arrière-plan de l'overlay est transparent par défaut — pas besoin de clé chroma.

## Audio

Le son des vidéos est mixé dans la source navigateur. Pour le router vers OBS :

- **Windows / macOS** : Paramètres OBS → **Audio** → **Avancé** → activez "Surveiller l'audio des sources navigateur".
- Réglez le volume de la source navigateur (mixer audio en bas d'OBS).

Pour couper le son côté LiveChat sans toucher OBS : tableau de bord → **Overlay** → décochez **Lire l'audio**.

## Positionnement

L'overlay occupe toute la zone par défaut. Pour réduire la zone d'alerte :

- Redimensionnez la source navigateur dans OBS (Alt + glisser pour rogner).
- Ou réglez la position des alertes via le tableau de bord → **Overlay → Position**.

## Multi-scènes

Vous pouvez ajouter la même source navigateur dans plusieurs scènes : utilisez **+ → Ajouter existant → LiveChat Overlay**. Une seule connexion Socket.IO est maintenue ainsi.

## Performances

- Si OBS rame : baissez la résolution de la source navigateur (`1280×720`).
- Cache navigateur OBS : `Outils → Cache → Vider` si l'overlay reste figé après une mise à jour.

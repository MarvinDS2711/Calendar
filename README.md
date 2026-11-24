# INOVACOM — Plateforme de prise de rendez-vous (migration de messagerie)

Application web complète permettant aux clients d'INOVACOM de réserver un créneau pour qu'un
technicien les appelle et migre leur messagerie, avec un espace administrateur sécurisé.

- **Page client** (`/`) : choix date → horaire → coordonnées → vérification → confirmation animée.
- **Espace admin** (`/admin`) : tableau de bord, gestion des rendez-vous, disponibilités, paramètres.

---

## 1. Architecture

| Couche | Choix | Pourquoi |
| --- | --- | --- |
| Serveur | Node.js 22 + Express 5 | Simple, robuste, un seul processus à déployer |
| Base de données | PostgreSQL : **Neon** en ligne (Vercel), **PGlite** (Postgres embarqué) en local | Même moteur partout ; en local, rien à installer |
| Validation | Zod (côté serveur) + validation en direct côté client | Aucune donnée invalide n'entre en base |
| Front-end | React 19 + Vite, Framer Motion, Lucide | Interface fluide, animations soignées |
| Dates | Luxon, fuseau **Europe/Paris** | Passage heure d'été/hiver géré |

```
api/index.js        point d'entrée Vercel (fonction serverless)
vercel.json         configuration Vercel
server/
  index.js          démarrage + création du 1er administrateur
  app.js            Express, sécurité (Helmet/CSP), fichiers statiques
  db.js             schéma PostgreSQL, connexion Neon / PGlite
  bootstrap.js      initialisation (base + compte admin)
  availability.js   moteur de calcul des créneaux
  auth.js           sessions, mots de passe (bcrypt), CSRF
  validation.js     schémas de validation
  routes/public.js  API publique (disponibilités, réservation)
  routes/admin.js   API admin (protégée)
  cli.js            gestion des comptes admin en ligne de commande
client/src/
  public/           page de réservation + animation de confirmation
  admin/            espace administrateur
branding/           ← déposez ici le logo officiel
test/               tests automatisés de l'API
```

### Garanties techniques

- **Aucune double réservation** : vérification + insertion dans une transaction protégée par un
  verrou PostgreSQL (valable même avec plusieurs serveurs Vercel en parallèle), doublée d'un
  **index unique partiel** en base (`un seul RDV actif par date/heure`). Un test
  envoie 12 réservations simultanées sur le même créneau : une seule aboutit, les 11 autres reçoivent
  un message clair (« Ce créneau vient d'être réservé… ») et le client revient au choix du créneau.
- **Confidentialité** : l'API publique ne renvoie que des horaires libres, jamais de données client.
  Après réservation, le client ne reçoit que ce qu'il vient lui-même de saisir.
- **Admin sécurisé côté serveur** : toutes les routes `/api/admin/*` exigent une session valide
  (cookie `HttpOnly`, `SameSite=Strict`, `Secure` en production, jeton aléatoire stocké haché),
  expiration glissante de 12 h, mots de passe hachés (bcrypt), limitation des tentatives de
  connexion, protection CSRF (contrôle d'origine + JSON obligatoire).
- **Anti-abus** : limitation des réservations par IP, champ piège anti-robot, en-têtes de sécurité
  (CSP, Helmet), export CSV protégé contre l'injection de formules.
- **Persistance** : PostgreSQL (`DATABASE_URL`) ; sans URL, base embarquée dans `data/pglite`.

---

## 2. Lancer le projet

Prérequis : **Node.js 22.13 ou plus récent** (aucune autre installation).

```bash
npm install
```

### En développement (rechargement automatique)

```bash
npm run dev
```

- Page client : http://localhost:5173
- Administration : http://localhost:5173/admin

### En production (local ou serveur)

```bash
npm run build
```

```bash
ADMIN_EMAIL=vous@inovacom.fr ADMIN_PASSWORD='un-mot-de-passe-solide' SECURE_COOKIES=false npm start
```

Puis ouvrez http://localhost:3000. (`SECURE_COOKIES=false` sert uniquement à tester en HTTP
sur votre poste ; en production derrière HTTPS, ne le mettez pas.)

### Tests

```bash
npm test
```

---

## 3. Accéder à l'interface administrateur

Adresse : **`/admin`** (ex. `https://rdv.inovacom.fr/admin`).

Au **premier démarrage**, un compte administrateur est créé automatiquement :

- si `ADMIN_EMAIL` et `ADMIN_PASSWORD` sont définis → ces identifiants sont utilisés ;
- sinon → e-mail `admin@inovacom.local` et un **mot de passe aléatoire affiché dans la console**.

Changez ensuite le mot de passe dans **Paramètres → Mot de passe**.

Gestion en ligne de commande (créer un collègue, réinitialiser un mot de passe oublié) :

```bash
npm run admin -- set technicien@inovacom.fr 'MotDePasseSolide' 'Prénom Nom'
```

```bash
npm run admin -- list
```

### Ce que propose l'espace admin

- **Tableau de bord** : total, à venir, effectués, annulés ; rendez-vous du jour avec bouton
  « Appeler » ; prochains rendez-vous ; alerte des RDV passés à clôturer ; lien client à copier.
- **Rendez-vous** : tableau (nom, e-mail, téléphone, date, heure, statut), recherche (nom, e-mail,
  téléphone même partiel, référence), filtres par statut et par période, tri, pagination, export
  CSV (Excel). Clic sur une ligne → fiche détaillée : appeler (`tel:`), écrire (`mailto:`), notes
  d'intervention, marquer effectué, modifier / replanifier, annuler, supprimer. Bouton
  « Nouveau » pour saisir un rendez-vous pris par téléphone.
- **Disponibilités** et **Paramètres** (voir ci-dessous).

---

## 4. Configurer les disponibilités

Menu **Disponibilités** :

1. **Règles de réservation** : durée d'un rendez-vous (15 min → 2 h), battement entre deux
   rendez-vous, délai minimum avant un rendez-vous (ex. 2 h), horizon de réservation (7 à 90 jours).
2. **Semaine type** : activez les jours travaillés et définissez une ou plusieurs plages horaires
   par jour (ex. 09:00–12:00 et 14:00–18:00). L'icône « copier » applique les horaires d'un jour du
   lundi au vendredi.
3. Cliquez sur **Enregistrer** dans la barre qui apparaît en bas.
4. **Exceptions** :
   - *Bloquer des dates* : un jour ou une période (congés, jours fériés). Si des rendez-vous
     existent déjà sur la période, vous êtes prévenu (ils ne sont pas annulés automatiquement).
   - *Disponibilité exceptionnelle* : horaires spécifiques pour une date (remplace la semaine type,
     ou ouvre un jour normalement fermé, ex. un samedi matin).

Les créneaux sont recalculés à chaque requête : **les changements sont visibles immédiatement**
sur la page publique (qui se rafraîchit aussi d'elle-même). Le panneau **Aperçu client** montre
le nombre de créneaux réellement proposés sur les 14 prochains jours.

Une annulation libère instantanément le créneau.

---

## 5. Installer le logo INOVACOM (animation définitive)

Déposez le fichier officiel dans le dossier **`branding/`** à la racine du projet :

- `branding/logo.png` — **recommandé** : PNG carré à fond transparent, 512 × 512 px minimum ;
- ou `branding/logo.svg`.

En local ou sur serveur, aucune recompilation ni redémarrage : actualisez la page. Le logo est alors utilisé dans l'en-tête,
le favicon et surtout l'**animation de confirmation** :

1. apparition du halo et du fond lumineux ;
2. **le logo se dessine comme une coche** : la branche gauche se révèle de haut en bas, puis la
   branche droite remonte, comme le geste d'une validation (pensé pour la forme du logo INOVACOM) ;
3. reflet de lumière qui balaie précisément la forme du logo ;
4. onde d'anneaux, éclats aux couleurs de la marque et badge de validation ;
5. le logo remonte, « Votre rendez-vous est confirmé ! » apparaît mot à mot, puis le récapitulatif
   (date, heure, numéro qui sera appelé, e-mail, référence), les conseils de préparation et le
   bouton **Ajouter à mon agenda** (.ics).

Tant que le fichier est absent, un emplacement neutre (nom INOVACOM en texte, cadre pointillé)
est affiché : aucun faux logo n'est dessiné. Le tableau de bord admin signale que le logo manque.

Sur **Vercel**, le logo doit être dans le dépôt GitHub : sur github.com, ouvrez le dossier
`branding/` → **Add file → Upload files** → déposez `logo.png` → **Commit**. Vercel redéploie
automatiquement en une minute.

Avec Docker, le dossier `branding/` est monté dans le conteneur (voir `docker-compose.yml`).

**Couleurs** : la palette (sarcelle, sarcelle profond, bleu acier, ardoise) est tirée du logo et
se règle en un seul endroit, en haut de `client/src/styles/base.css` (variables `--brand-*`,
`--steel-*`).

---

## 6. Déployer l'application

### ⭐ Vercel + Neon (recommandé — lien public en quelques minutes)

Vercel n'ayant pas de disque permanent, les données sont stockées dans **Neon** (PostgreSQL
gratuit, intégré à Vercel).

1. Sur [vercel.com](https://vercel.com), **Add New… → Project**, importez le dépôt GitHub
   `MarvinDS2711/calendar`. Laissez les réglages détectés (le fichier `vercel.json` s'en charge).
2. Avant de cliquer sur *Deploy*, ouvrez **Environment Variables** et ajoutez :
   - `ADMIN_EMAIL` = votre e-mail de connexion admin
   - `ADMIN_PASSWORD` = un mot de passe solide (10 caractères minimum)
3. Cliquez sur **Deploy**. (Le premier déploiement peut échouer à l'usage tant que la base
   n'est pas branchée : c'est normal.)
4. Dans le projet : onglet **Storage → Create Database → Neon (Serverless Postgres)** → créer,
   puis **Connect** au projet (environnements Production et Preview). Vercel ajoute
   automatiquement la variable `DATABASE_URL`.
5. Onglet **Deployments** → menu « … » du dernier déploiement → **Redeploy**.
6. Votre lien client est l'adresse du projet, par ex. `https://calendar-xxxx.vercel.app/`
   (personnalisable dans **Settings → Domains**, ex. `rdv.inovacom.fr`).
   L'administration est sur `https://…/admin`.

Les tables sont créées automatiquement au premier appel. Pour changer le logo, ajoutez
`branding/logo.png` dans le dépôt GitHub : Vercel redéploie tout seul.

Réinitialiser un mot de passe admin sur la base en ligne : copiez `DATABASE_URL` depuis Vercel
(Settings → Environment Variables), puis depuis votre poste :

```bash
DATABASE_URL='postgres://…' npm run admin -- set vous@inovacom.fr 'NouveauMotDePasse'
```


### Autres hébergements

L'application est aussi **un service Node classique** qui a besoin soit d'un PostgreSQL
(`DATABASE_URL`), soit d'un **disque persistant** pour la base embarquée (`DATA_DIR`) et, idéalement, d'un **HTTPS** devant (obligatoire pour les cookies sécurisés).
Variables disponibles : voir `.env.example`.

### Option A — Docker (VPS OVH, Scaleway, serveur interne…)

```bash
cp .env.example .env
```

Éditez `.env` (identifiants admin), déposez le logo dans `branding/`, puis :

```bash
docker compose up -d --build
```

L'application écoute sur le port 3000 ; la base est conservée dans le volume `inovacom-data`.
Placez un reverse proxy HTTPS devant (Caddy, Nginx + Let's Encrypt, Traefik). Exemple Caddy :

```
rdv.inovacom.fr {
  reverse_proxy localhost:3000
}
```

### Option B — Sans Docker (VPS avec Node 22)

```bash
npm ci && npm run build
```

```bash
NODE_ENV=production TRUST_PROXY=1 ADMIN_EMAIL=… ADMIN_PASSWORD=… pm2 start "npm start" --name inovacom-rdv
```

### Option C — PaaS (Render, Railway, Fly.io, Clever Cloud…)

- Commande de build : `npm ci && npm run build` (ou le `Dockerfile` fourni)
- Commande de démarrage : `npm start`
- Fournir `DATABASE_URL` (PostgreSQL) **ou** un volume persistant pointé par `DATA_DIR`
- Définir `TRUST_PROXY=1`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`

### Sauvegardes

Neon conserve un historique et permet la restauration à un instant donné (console Neon).
Sauvegarde manuelle :

```bash
pg_dump "$DATABASE_URL" > inovacom-$(date +%F).sql
```

---

## 7. Pistes d'évolution

- E-mail / SMS de confirmation et de rappel au client (ex. via Brevo, Mailjet, OVH SMS).
- Plusieurs techniciens avec agendas distincts.
- Lien d'annulation / de report pour le client.

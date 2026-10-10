# Commande bar — Bucolique (blindtest)

Module de commande de boissons par QR code.
Le client scanne le QR posé sur sa table, commande, et paie en cases sur une carte à cocher.

**Unité de compte : la case. 1 case = 0,50 € — 1 carte = 10 € = 20 cases.**
Les prix sont stockés en cases (entiers) ; les euros sont un affichage dérivé.

## Stack

React 18 + Vite + Supabase, déployé sur Vercel.

## Mise en route

```bash
npm install
cp .env.example .env.local   # puis remplir les deux valeurs
npm run dev
```

Les valeurs viennent du dashboard Supabase : Project Settings → API.
Prendre la clé **anon / public**, jamais la `service_role`.

## Base de données

Coller dans le SQL Editor Supabase, dans cet ordre :

1. `sql/schema-commande-bar.sql` — tables, RLS, RPC publiques
2. `sql/002-import-et-tables.sql` — contraintes d'unicité, import de carte, création de tables
3. `sql/003-service-et-annulation.sql` — interrupteur de service, annulation
Vérification :

```sql
select routine_name from information_schema.routines
where routine_schema='public' and routine_name like 'bar_%';
```

Doit renvoyer `bar_menu`, `bar_passer_commande`, `bar_suivi`.

## Sécurité

Le client anonyme n'a **aucun** accès direct aux tables : toutes les policies RLS
sont réservées au rôle `authenticated`. Le parcours public passe par trois
fonctions `security definer` :

| Fonction | Rôle |
|---|---|
| `bar_menu(token)` | résout le QR et renvoie la carte du moment |
| `bar_passer_commande(token, lignes, commentaire)` | enregistre la commande |
| `bar_suivi(commande_id)` | statut d'une commande |

Réservées au rôle `authenticated` : `bar_import_carte`, `bar_creer_tables`,
`bar_annuler_commande`.

Le total est **recalculé en base** à partir des prix réels. Un client qui
modifie la requête depuis son téléphone ne peut pas s'attribuer un tarif.
Garde-fou anti-spam : 3 commandes maximum par table et par minute.

## Routes

| Route | Usage |
|---|---|
| `/c/:token` | formulaire client (public, pas de login) |
| `/bar` | écran bar, commandes en temps réel |
| `/service` | file des commandes prêtes, cases dues |
| `/admin` | import de la carte, prix, disponibilité, tables |
| `/admin/qr` | planche de QR codes à imprimer |

## Données

Toutes les données s'encodent via les formulaires de l'app.
Le seed du SQL n'est qu'un point de départ — ne jamais éditer les tarifs
directement dans un fichier source.

## QR codes

```sql
select numero, 'https://TON-APP.vercel.app/c/' || token
from bar_tables order by numero;
```

## Déploiement

Vercel détecte Vite automatiquement. Ajouter les deux variables
d'environnement dans Settings → Environment Variables, puis **Redeploy** —
elles sont lues au build, pas à l'exécution.

`vercel.json` contient la réécriture SPA : sans elle, un accès direct à
`/c/<token>` renvoie une 404 en production.

## Import de la carte

CSV à trois colonnes : `categorie`, `nom`, `prix_euros`.
Modèle téléchargeable depuis `/admin`, ou `public/modele-carte.csv`.

Les prix doivent tomber sur un multiple de 0,50 €. L'import est atomique :
si une ligne est invalide, rien n'est écrit.

## QR codes

Page `/admin/qr`. **Imprimer depuis l'URL de production**, pas depuis la
preview StackBlitz : l'URL encodée dans le QR est celle du navigateur.

## Comptes équipe

Supabase → Authentication → Users → Add user, avec *Auto Confirm User* coché.
Désactiver les inscriptions publiques : Authentication → Providers → Email →
décocher *Enable sign ups*.

## PWA / installation

`vite-plugin-pwa` génère le manifeste et le service worker au build.

**Le service worker n'est actif qu'en production** (`npm run build` puis
`npm run preview`, ou le déploiement Vercel). En `npm run dev`, l'app
fonctionne mais ne s'installe pas : c'est normal.

**HTTPS obligatoire.** L'URL Vercel l'est ; `localhost` aussi.

### iPhone

Pas d'invite automatique : Apple ne l'implémente pas. Le parcours est
**Safari → bouton Partager → Sur l'écran d'accueil → Ajouter**. Depuis
Chrome ou Firefox sur iOS, l'option n'existe pas. L'accueil affiche ces
étapes via le composant `InviteInstallation`.

L'icône installée vient de la balise `apple-touch-icon`, pas du manifeste.

### Ce qui n'est PAS mis en cache

Tous les appels vers `*.supabase.co` sont en `NetworkOnly`. Une carte
périmée ou un statut de commande obsolète servi depuis le cache ferait plus
de dégâts qu'une erreur réseau visible. Seule la coquille de l'app
(JS, CSS, images) est précachée.

## Service ouvert / fermé

Interrupteur en haut de l'écran bar. Le contrôle est **dans la base**, pas
dans le front : un QR photographié et rejoué plus tard est refusé côté
serveur. Les commandes déjà reçues restent à traiter.

## Annulation

Bouton sur chaque ticket du bar, avec motif facultatif. Une commande
`servie` n'est plus annulable : les cases ont été cochées sur la carte du
client, l'annuler fausserait la réconciliation.

## Reste à faire

- Mode dégradé : file d'attente d'envoi des commandes hors ligne
- Procédure papier de secours (carnets pré-imprimés au bar)
- Écran de récap fin de soirée (vues `bar_recap_soiree`, `bar_recap_articles` — droits déjà accordés)

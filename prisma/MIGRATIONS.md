# Migrations BDD à appliquer

Deux migrations sont prêtes mais pas encore appliquées en production.
Le code est rétro-compatible (fallback gracieux), mais pour bénéficier
pleinement des fonctionnalités, applique-les avec :

## Commandes prêtes

```bash
# Vérifier le statut des migrations
npm run db:status

# Appliquer en production (mode maintenance recommandé : ~30 secondes)
DATABASE_URL=$DATABASE_URL_PROD npm run db:migrate

# (Régénération du client incluse dans la build, mais possible manuellement)
npm run db:generate
```

## Variables d'environnement

```bash
# .env (à la racine)
DATABASE_URL="postgresql://sial_app:PASSWORD@37.187.250.4:5432/sial-planning"
```

Pour tester localement la migration sur une copie locale :

```bash
# Créer une BDD locale de test
createdb sial_planning_test

# Lancer la migration en mode dev (interactif)
DATABASE_URL=postgresql://localhost:5432/sial_planning_test npm run db:migrate:dev

# Lancer le test de planification après migration
npm run test:planif
```

## 1. `20260429_workpost_planning_autonome`

**Effet** : ajoute 11 colonnes à `WorkPost` pour la planification autonome.

```sql
ALTER TABLE "WorkPost"
  ADD COLUMN IF NOT EXISTS "shortLabel"     TEXT,
  ADD COLUMN IF NOT EXISTS "phase"          TEXT,
  ADD COLUMN IF NOT EXISTS "maxOperators"   INTEGER,
  ADD COLUMN IF NOT EXISTS "tamponMinAfter" INTEGER,
  ADD COLUMN IF NOT EXISTS "color"          TEXT,
  ADD COLUMN IF NOT EXISTS "visible"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "parallelism"    INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "parallelGain"   JSONB,
  ADD COLUMN IF NOT EXISTS "monolithic"     BOOLEAN NOT NULL DEFAULT false;
```

Toutes les colonnes sont nullables ou ont une valeur par défaut sûre.
Les données existantes ne sont pas touchées. `ensureWorkPosts()` se
chargera de remplir ces colonnes au prochain démarrage de l'app via
les valeurs définies dans `lib/work-posts.ts`.

## 2. `20260429_operator_schedule`

**Effet** : ajoute `defaultSchedule` (JSON) et `naissance` (texte) à `Operator`.

```sql
ALTER TABLE "Operator"
  ADD COLUMN IF NOT EXISTS "defaultSchedule" JSONB,
  ADD COLUMN IF NOT EXISTS "naissance"       TEXT;
```

Permet de saisir les horaires détaillés par jour pour chaque opérateur
(ex: Alain commence à 7h30 finit à 15h, JP fait 4h le vendredi matin)
et la date de naissance pour les anniversaires.

## Fallback si la migration n'est pas appliquée

Le code fait des `try/catch` autour des champs nouveaux :

- `ensureWorkPosts()` (lib/work-posts-server.ts) tente d'écrire les
  champs nouveaux, retombe sur les colonnes historiques en cas d'erreur.
- `PATCH /api/operators/[id]` accepte `defaultSchedule` et `naissance`
  mais retire ces champs et retente sans eux si la BDD ne les a pas.

Donc l'app fonctionne **sans** la migration, mais les fonctionnalités
suivantes ne sont **pas disponibles tant que la migration n'est pas
appliquée** :

- Capacité machine (`capacityMinDay × 5j`) lue depuis BDD
- Visibilité par défaut des postes (toggle)
- Tampon par poste (utilise valeur défaut 240)
- Parallélisme et courbe de gain (utilise valeurs défaut)
- Horaires détaillés par opérateur (utilise convention weekHours)
- Date de naissance des opérateurs

Une fois la migration appliquée, redémarrer l'app — `ensureWorkPosts()`
synchronisera automatiquement les valeurs de `lib/work-posts.ts` en BDD.

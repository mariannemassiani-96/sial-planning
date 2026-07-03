-- Planning AJ — remodelage du panneau gauche :
-- 1. Créer la table PlanningBacklog (tâches à positionner).
-- 2. Purger les semaines S28-S31 (on garde S25 → S27 tel Excel).
-- 3. Seed le backlog avec la liste fournie par AJ.

CREATE TABLE IF NOT EXISTS "PlanningBacklog" (
  "id"        TEXT         NOT NULL,
  "etape"     TEXT         NOT NULL,
  "chantier"  TEXT         NOT NULL,
  "qte"       INTEGER,
  "note"      TEXT,
  "ordre"     INTEGER      NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanningBacklog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlanningBacklog_ordre_idx"
  ON "PlanningBacklog"("ordre");

-- Purge S28-S31 (on garde S25-S27)
DELETE FROM "PlanningAJ" WHERE semaine IN ('S28 2026', 'S29 2026', 'S30 2026', 'S31 2026');

-- Seed backlog — 80 items dans l'ordre saisi
-- Utilise WHERE NOT EXISTS pour être idempotent (si on relance)
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-0'), 'Coupe LMT', 'Ranch Algelec', 27, 0 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-0'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-1'), 'Coupe LMT', 'JPC Maison Corbara', 64, 1 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-1'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-2'), 'Renfort', 'Paese Novu 133', 29, 2 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-2'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-3'), 'Renfort', 'Querciu Bat E', 20, 3 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-3'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-4'), 'Montage ALU', 'Ranch Algelec', 5, 4 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-4'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-5'), 'Vitrage', 'Ranch Algelec', 4, 5 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-5'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-6'), 'Coupe LMT', 'JPC Maison Corbara', NULL, 6 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-6'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-7'), 'Renfort', 'Querciu Bat E', 40, 7 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-7'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-8'), 'Montage ALU', 'JPC Maison Corbara', 8, 8 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-8'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-9'), 'Montage ALU', 'Ranch Algelec', NULL, 9 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-9'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-10'), 'Vitrage', 'Ranch Algelec', 2, 10 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-10'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-11'), 'Vitrage', 'Paese Novu 129', 39, 11 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-11'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-12'), 'Montage ALU', 'JPC Maison Corbara', 4, 12 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-12'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-13'), 'Montage ALU', 'JPC Maison Corbara Minimaliste', 1, 13 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-13'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-14'), 'Montage ALU', 'JPC Maison Corbara Minimaliste', 1, 14 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-14'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-15'), 'Coupe LMT', 'Querciu Bat E P1', 60, 15 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-15'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-16'), 'Renfort', 'Querciu Bat E', 60, 16 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-16'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-17'), 'Soudure', 'Paese Novu 132', 58, 17 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-17'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-18'), 'Montage PVC', 'Paese Novu 132', 18, 18 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-18'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-19'), 'Coupe LMT', 'Querciu Bat E P2', 60, 19 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-19'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-20'), 'Renfort', 'Paese Novu N1 136', 39, 20 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-20'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-21'), 'Soudure', 'Paese Novu 133', 51, 21 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-21'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-22'), 'Montage PVC', 'Paese Novu 133', 17, 22 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-22'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-23'), 'Coupe LMT', 'Querciu Bat E P3', 60, 23 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-23'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-24'), 'Renfort', 'Paese Novu N1 135/136', 23, 24 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-24'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-25'), 'Soudure', 'Paese Novu 134', 67, 25 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-25'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-26'), 'Montage PVC', 'Paese Novu 134', 20, 26 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-26'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-27'), 'Coupe LMT', 'Paese Novu 133', 51, 27 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-27'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-28'), 'Renfort', 'Paese Novu N1 134', 48, 28 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-28'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-29'), 'Soudure', 'Paese Novu 135', 60, 29 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-29'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-30'), 'Montage PVC', 'Paese Novu N1 135', 20, 30 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-30'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-31'), 'Coupe LMT', 'Paese Novu 134', 75, 31 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-31'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-32'), 'Soudure', 'Paese Novu 136', 60, 32 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-32'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-33'), 'Montage PVC', 'Paese Novu N1 136', 20, 33 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-33'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-34'), 'Coupe LMT', 'Paese Novu N1 135', 44, 34 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-34'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-35'), 'Soudure', 'Querciu Bat E P1', 50, 35 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-35'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-36'), 'Coupe LMT', 'Paese Novu N1 136', 47, 36 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-36'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-37'), 'Montage ALU', 'Cas''Apertura Pianiccia', NULL, 37 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-37'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-38'), 'Soudure', 'Querciu Bat E P2', 40, 38 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-38'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-39'), 'Coupe LMT', 'Pratali Folelli', 20, 39 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-39'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-40'), 'Montage ALU', 'Pratali Folelli', 7, 40 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-40'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-41'), 'Soudure', 'Querciu Bat E P3', 40, 41 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-41'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-42'), 'Coupe LMT', 'Casa di Lama', 65, 42 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-42'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-43'), 'Montage ALU', 'Casa Di Lama', 18, 43 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-43'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-44'), 'Coupe LMT', 'Navarri Miel', 20, 44 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-44'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-45'), 'Montage ALU', 'Navarri Miel', 5, 45 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-45'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-46'), 'Coupe LMT', 'Cas''Apertura Pianiccia', NULL, 46 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-46'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-47'), 'Coupe LMT', 'JPC Pompes Funèbres Suite', 20, 47 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-47'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-48'), 'Coupe LMT', 'Ranch Stock Calarossa 9005P', 1, 48 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-48'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-49'), 'Coupe LMT', 'Ranch Tcheurekjan', 25, 49 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-49'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-50'), 'Renfort', 'Paese Novu N1 137', 39, 50 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-50'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-51'), 'Soudure', 'Querciu Bat E P2/P3', 50, 51 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-51'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-52'), 'Montage PVC', 'Paese Novu N1 136', 3, 52 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-52'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-53'), 'Coupe LMT/DT', 'Paese Novu N1 137', 68, 53 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-53'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-54'), 'Renfort', 'Paese Novu N1 138', 39, 54 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-54'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-55'), 'Soudure', 'Querciu Bat E P3', 8, 55 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-55'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-56'), 'Montage PVC', 'Querciu Bat E P1', 20, 56 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-56'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-57'), 'Montage ALU', 'Ranch Viellecazes Sup', 1, 57 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-57'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-58'), 'Montage ALU', 'JPC Pompes Funèbres Suite', 2, 58 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-58'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-59'), 'Montage ALU', 'Ranch Tcheurekjan', 2, 59 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-59'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-60'), 'Coupe LMT/DT', 'Paese Novu N1 138', 68, 60 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-60'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-61'), 'Soudure', 'Paese Novu N1 137', 50, 61 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-61'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-62'), 'Montage PVC', 'Querciu Bat E P1', 2, 62 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-62'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-63'), 'Montage ALU', 'JPC Pompes Funèbres Suite', 2, 63 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-63'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-64'), 'Montage ALU', 'Ranch Tcheurekjan', 2, 64 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-64'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-65'), 'Vitrage', 'Paese Novu N1 130', 35, 65 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-65'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-66'), 'Vitrage', 'Paese Novu N1 131', 39, 66 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-66'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-67'), 'Soudure', 'Paese Novu N1 137', 19, 67 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-67'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-68'), 'Soudure', 'Paese Novu N1 138', 11, 68 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-68'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-69'), 'Montage PVC', 'Querciu Bat E P2', 20, 69 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-69'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-70'), 'Coupe LMT', 'Casa di Lama', 65, 70 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-70'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-71'), 'Coupe LMT/DT', 'Beance Frappes', 20, 71 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-71'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-72'), 'Soudure', 'Paese Novu N1 138', 50, 72 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-72'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-73'), 'Montage PVC', 'Querciu Bat E P2', 2, 73 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-73'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-74'), 'Montage PVC', 'Geronimi PVC', 2, 74 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-74'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-75'), 'Soudure', 'Paese Novu N1 138', 8, 75 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-75'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-76'), 'Montage PVC', 'Querciu Bat E P3', 20, 76 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-76'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-77'), 'Montage ALU', 'Beance Frappes', 3, 77 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-77'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-78'), 'Montage PVC', 'Querciu Bat E P3', 2, 78 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-78'));
INSERT INTO "PlanningBacklog" ("id", "etape", "chantier", "qte", "ordre") SELECT md5('backlog-seed-79'), 'Montage ALU', 'Beance Frappes', 3, 79 WHERE NOT EXISTS (SELECT 1 FROM "PlanningBacklog" WHERE "id" = md5('backlog-seed-79'));
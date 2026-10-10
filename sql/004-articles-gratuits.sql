-- ============================================================
-- Migration 004 — Articles gratuits (prix à 0 case)
-- DÉJÀ APPLIQUÉE en production le 10/10/2026.
-- Conservée ici pour que le dépôt reste la référence du schéma.
-- ============================================================

alter table bar_articles drop constraint if exists bar_articles_prix_cases_check;
alter table bar_articles add constraint bar_articles_prix_cases_check check (prix_cases >= 0);

-- bar_import_carte : accepte 0, refuse le négatif.
-- bar_passer_commande : une commande entièrement offerte est valide ;
--   le contrôle porte sur le nombre de lignes retenues, plus sur le total.
-- (corps complet appliqué en base — voir l'historique des migrations Supabase)

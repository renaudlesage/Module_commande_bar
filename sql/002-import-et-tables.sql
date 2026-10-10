-- ============================================================
-- Migration 002 — Import de la carte & génération des tables
-- À coller dans le SQL Editor Supabase, après le schéma initial.
-- Idempotent : peut être rejouée sans dommage.
-- ============================================================

-- ----------- 1. Unicité, pour permettre les upserts ---------

do $$ begin
  alter table bar_categories add constraint uq_cat_nom unique (nom);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table bar_articles add constraint uq_art_cat_nom unique (categorie_id, nom);
exception when duplicate_table or duplicate_object then null;
end $$;

-- ----------- 2. Import de la carte --------------------------
-- p_lignes : [{"categorie":"Bières","nom":"Pils 25cl","prix_cases":4}, ...]
-- p_remplacer : true  = la carte importée devient la carte (le reste est supprimé)
--               false = ajout / mise à jour, le reste est conservé
--
-- Tout se joue dans une seule transaction : si une ligne casse, rien n'est écrit.

create or replace function bar_import_carte(p_lignes jsonb, p_remplacer boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cat_creees int := 0;
  v_art_traites int := 0;
  v_art_supprimes int := 0;
  v_ordre int := 0;
  l jsonb;
  v_cat_id uuid;
begin
  if jsonb_array_length(p_lignes) = 0 then
    raise exception 'Aucune ligne à importer';
  end if;

  -- Validation préalable de l'ensemble, avant toute écriture
  for l in select * from jsonb_array_elements(p_lignes) loop
    if coalesce(trim(l->>'nom'), '') = '' then
      raise exception 'Ligne sans nom d''article';
    end if;
    if coalesce(trim(l->>'categorie'), '') = '' then
      raise exception 'Article "%" sans catégorie', l->>'nom';
    end if;
    if (l->>'prix_cases') is null or (l->>'prix_cases')::numeric <= 0
       or (l->>'prix_cases')::numeric <> floor((l->>'prix_cases')::numeric) then
      raise exception 'Prix invalide pour "%": doit être un nombre entier de cases', l->>'nom';
    end if;
  end loop;

  if p_remplacer then
    -- Les lignes de commande conservent leur libellé et leur prix (snapshot),
    -- l'historique n'est donc pas altéré par cette suppression.
    delete from bar_articles;
    get diagnostics v_art_supprimes = row_count;
  end if;

  for l in select * from jsonb_array_elements(p_lignes) loop
    v_ordre := v_ordre + 1;

    insert into bar_categories(nom, ordre)
    values (trim(l->>'categorie'), v_ordre)
    on conflict (nom) do update set nom = excluded.nom
    returning id into v_cat_id;

    insert into bar_articles(categorie_id, nom, prix_cases, ordre, disponible)
    values (v_cat_id, trim(l->>'nom'), (l->>'prix_cases')::int, v_ordre, true)
    on conflict (categorie_id, nom) do update
      set prix_cases = excluded.prix_cases,
          ordre      = excluded.ordre,
          disponible = true;

    v_art_traites := v_art_traites + 1;
  end loop;

  select count(*) into v_cat_creees from bar_categories;

  return jsonb_build_object(
    'articles_importes', v_art_traites,
    'articles_supprimes', v_art_supprimes,
    'categories_total', v_cat_creees
  );
end $$;

-- ----------- 3. Génération des tables -----------------------
-- Crée les tables manquantes dans un intervalle. Ne touche pas aux existantes,
-- donc les tokens déjà imprimés sur les QR restent valides.

create or replace function bar_creer_tables(
  p_prefixe text default 'T',
  p_de int default 1,
  p_a int default 20,
  p_zone text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_creees int;
begin
  if p_a < p_de or (p_a - p_de) > 499 then
    raise exception 'Intervalle invalide (500 tables maximum)';
  end if;

  insert into bar_tables(numero, zone)
  select p_prefixe || lpad(i::text, 2, '0'), p_zone
  from generate_series(p_de, p_a) i
  on conflict (numero) do nothing;

  get diagnostics v_creees = row_count;

  return jsonb_build_object(
    'creees', v_creees,
    'total', (select count(*) from bar_tables)
  );
end $$;

-- ----------- 4. Droits --------------------------------------
-- Réservé à l'équipe connectée : jamais au rôle anon.

revoke all on function bar_import_carte(jsonb, boolean) from public, anon;
revoke all on function bar_creer_tables(text, int, int, text) from public, anon;
grant execute on function bar_import_carte(jsonb, boolean) to authenticated;
grant execute on function bar_creer_tables(text, int, int, text) to authenticated;

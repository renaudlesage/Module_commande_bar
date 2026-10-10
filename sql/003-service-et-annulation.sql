-- ============================================================
-- Migration 003 — Interrupteur de service & annulation
-- À coller après 002. Idempotent.
-- ============================================================

-- ----------- 1. Configuration du service --------------------
-- Une seule ligne, garantie par la contrainte sur l'id.

create table if not exists bar_config (
  id              int primary key default 1 check (id = 1),
  service_ouvert  boolean not null default true,
  message_ferme   text default 'Le service est fermé pour le moment.',
  updated_at      timestamptz not null default now()
);

insert into bar_config(id) values (1) on conflict (id) do nothing;

alter table bar_config enable row level security;

do $$ begin
  create policy staff_all_cfg on bar_config for all to authenticated
    using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ----------- 2. Motif d'annulation --------------------------

alter table bar_commandes add column if not exists motif_annulation text;

-- ----------- 3. Le menu renvoie l'état du service -----------

create or replace function bar_menu(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_table bar_tables; v_menu jsonb; v_cfg bar_config;
begin
  select * into v_table from bar_tables where token = p_token and actif;
  if not found then
    raise exception 'Table inconnue ou desactivee' using errcode = 'P0002';
  end if;

  select * into v_cfg from bar_config where id = 1;

  select coalesce(jsonb_agg(x order by x->>'cat_ordre', x->>'ordre'), '[]'::jsonb)
    into v_menu
  from (
    select jsonb_build_object(
      'id', a.id, 'nom', a.nom, 'prix_cases', a.prix_cases,
      'categorie', c.nom, 'cat_ordre', c.ordre, 'ordre', a.ordre
    ) as x
    from bar_articles a
    left join bar_categories c on c.id = a.categorie_id
    where a.disponible and coalesce(c.actif, true)
  ) s;

  return jsonb_build_object(
    'table', jsonb_build_object('id', v_table.id, 'numero', v_table.numero, 'zone', v_table.zone),
    'articles', v_menu,
    'service_ouvert', coalesce(v_cfg.service_ouvert, true),
    'message_ferme', v_cfg.message_ferme
  );
end $$;

-- ----------- 4. Refus de commande service fermé -------------
-- Le contrôle est ici, pas dans le front : un QR photographié et rejoué
-- depuis un canapé à 2h du matin doit être refusé par la base.

create or replace function bar_passer_commande(
  p_token uuid, p_lignes jsonb, p_commentaire text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table_id uuid; v_cmd_id uuid; v_total int := 0; v_recentes int; v_ouvert boolean;
begin
  select service_ouvert into v_ouvert from bar_config where id = 1;
  if not coalesce(v_ouvert, true) then
    raise exception 'Service ferme' using errcode = 'P0003';
  end if;

  select id into v_table_id from bar_tables where token = p_token and actif;
  if not found then
    raise exception 'Table inconnue ou desactivee' using errcode = 'P0002';
  end if;

  if jsonb_array_length(p_lignes) = 0 or jsonb_array_length(p_lignes) > 20 then
    raise exception 'Commande vide ou trop longue';
  end if;

  select count(*) into v_recentes from bar_commandes
   where table_id = v_table_id and created_at > now() - interval '1 minute';
  if v_recentes >= 3 then
    raise exception 'Trop de commandes pour cette table, patientez une minute'
      using errcode = 'P0001';
  end if;

  insert into bar_commandes(table_id, commentaire) values (v_table_id, p_commentaire)
    returning id into v_cmd_id;

  insert into bar_lignes(commande_id, article_id, libelle, prix_cases, quantite)
  select v_cmd_id, a.id, a.nom, a.prix_cases, (l->>'quantite')::int
  from jsonb_array_elements(p_lignes) l
  join bar_articles a on a.id = (l->>'article_id')::uuid and a.disponible;

  select coalesce(sum(prix_cases * quantite), 0) into v_total
    from bar_lignes where commande_id = v_cmd_id;

  if v_total = 0 then
    raise exception 'Aucun article disponible dans cette commande';
  end if;

  update bar_commandes set cases_dues = v_total where id = v_cmd_id;

  return jsonb_build_object(
    'commande_id', v_cmd_id,
    'cases_dues', v_total,
    'euros', round(v_total * 0.5, 2)
  );
end $$;

-- ----------- 5. Annulation ----------------------------------
-- Une commande servie n'est plus annulable : les cases ont été cochées
-- sur la carte du client, l'annuler fausserait la réconciliation.

create or replace function bar_annuler_commande(p_id uuid, p_motif text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_statut bar_statut;
begin
  select statut into v_statut from bar_commandes where id = p_id;
  if not found then
    raise exception 'Commande introuvable';
  end if;
  if v_statut = 'servie' then
    raise exception 'Commande deja servie : les cases ont ete cochees';
  end if;
  if v_statut = 'annulee' then
    return jsonb_build_object('deja_annulee', true);
  end if;

  update bar_commandes
     set statut = 'annulee',
         motif_annulation = nullif(trim(coalesce(p_motif, '')), '')
   where id = p_id;

  return jsonb_build_object('annulee', true);
end $$;

-- ----------- 6. Droits --------------------------------------

revoke all on function bar_annuler_commande(uuid, text) from public, anon;
grant execute on function bar_annuler_commande(uuid, text) to authenticated;

grant execute on function bar_menu(uuid) to anon, authenticated;
grant execute on function bar_passer_commande(uuid, jsonb, text) to anon, authenticated;

-- Les vues de récap, pour l'écran de fin de soirée
grant select on bar_recap_soiree, bar_recap_articles to authenticated;

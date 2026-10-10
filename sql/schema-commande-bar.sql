-- ============================================================
-- Module de commande bar — cartes à cocher, cases de 0,50 €
-- 1 case = 0,50 € / 1 carte = 10 € = 20 cases
-- À coller dans le SQL Editor Supabase, d'un bloc.
-- ============================================================

-- ----------- 1. RÉFÉRENTIELS -------------------------------

create table if not exists bar_categories (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  ordre       int  not null default 0,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists bar_articles (
  id           uuid primary key default gen_random_uuid(),
  categorie_id uuid references bar_categories(id) on delete set null,
  nom          text not null,
  prix_cases   int  not null check (prix_cases > 0),  -- en cases de 0,50 €
  disponible   boolean not null default true,
  ordre        int  not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_articles_cat on bar_articles(categorie_id, ordre);

create table if not exists bar_tables (
  id      uuid primary key default gen_random_uuid(),
  numero  text not null unique,
  zone    text,
  token   uuid not null unique default gen_random_uuid(),
  actif   boolean not null default true
);

create index if not exists idx_tables_token on bar_tables(token);

-- ----------- 2. COMMANDES ----------------------------------

do $$ begin
  create type bar_statut as enum ('recue','preparation','prete','servie','annulee');
exception when duplicate_object then null;
end $$;

create table if not exists bar_commandes (
  id           uuid primary key default gen_random_uuid(),
  table_id     uuid not null references bar_tables(id) on delete restrict,
  statut       bar_statut not null default 'recue',
  cases_dues   int not null default 0,       -- calculé côté serveur, jamais par le client
  commentaire  text,
  serveur      text,                          -- qui a servi / encaissé les cases
  created_at   timestamptz not null default now(),
  servie_at    timestamptz
);

create index if not exists idx_cmd_statut  on bar_commandes(statut, created_at);
create index if not exists idx_cmd_table   on bar_commandes(table_id, created_at desc);

create table if not exists bar_lignes (
  id          uuid primary key default gen_random_uuid(),
  commande_id uuid not null references bar_commandes(id) on delete cascade,
  article_id  uuid references bar_articles(id) on delete set null,
  libelle     text not null,   -- snapshot : survit au renommage de l'article
  prix_cases  int  not null,   -- snapshot : survit au changement de tarif
  quantite    int  not null check (quantite between 1 and 30)
);

create index if not exists idx_lignes_cmd on bar_lignes(commande_id);

-- ----------- 3. RPC PUBLIQUES (security definer) -----------
-- Le client anonyme ne touche JAMAIS les tables en écriture.
-- Il passe par ces deux fonctions, qui recalculent le total.

-- Résout le QR : token -> table + menu du moment
create or replace function bar_menu(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_table bar_tables; v_menu jsonb;
begin
  select * into v_table from bar_tables where token = p_token and actif;
  if not found then
    raise exception 'Table inconnue ou desactivee' using errcode = 'P0002';
  end if;

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
    'articles', v_menu
  );
end $$;

-- Enregistre une commande. p_lignes = [{"article_id":"...","quantite":2}, ...]
create or replace function bar_passer_commande(
  p_token uuid, p_lignes jsonb, p_commentaire text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table_id uuid; v_cmd_id uuid; v_total int := 0; v_recentes int;
begin
  select id into v_table_id from bar_tables where token = p_token and actif;
  if not found then
    raise exception 'Table inconnue ou desactivee' using errcode = 'P0002';
  end if;

  if jsonb_array_length(p_lignes) = 0 or jsonb_array_length(p_lignes) > 20 then
    raise exception 'Commande vide ou trop longue';
  end if;

  -- garde-fou anti-spam : 3 commandes max par table par minute
  select count(*) into v_recentes from bar_commandes
   where table_id = v_table_id and created_at > now() - interval '1 minute';
  if v_recentes >= 3 then
    raise exception 'Trop de commandes pour cette table, patientez une minute'
      using errcode = 'P0001';
  end if;

  insert into bar_commandes(table_id, commentaire) values (v_table_id, p_commentaire)
    returning id into v_cmd_id;

  -- prix relus en base : un client qui bidouille le JSON ne change rien
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

-- Suivi côté client (lecture de SA commande uniquement, par id)
create or replace function bar_suivi(p_commande_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object('statut', c.statut, 'cases_dues', c.cases_dues,
                            'table', t.numero)
    into v
  from bar_commandes c join bar_tables t on t.id = c.table_id
  where c.id = p_commande_id;
  return coalesce(v, '{}'::jsonb);
end $$;

-- ----------- 4. RLS ----------------------------------------

alter table bar_categories enable row level security;
alter table bar_articles   enable row level security;
alter table bar_tables     enable row level security;
alter table bar_commandes  enable row level security;
alter table bar_lignes     enable row level security;

-- anon : aucune policy = aucun accès direct. Tout passe par les RPC.
-- staff connecté : accès complet.
create policy staff_all_cat    on bar_categories for all to authenticated using (true) with check (true);
create policy staff_all_art    on bar_articles   for all to authenticated using (true) with check (true);
create policy staff_all_tab    on bar_tables     for all to authenticated using (true) with check (true);
create policy staff_all_cmd    on bar_commandes  for all to authenticated using (true) with check (true);
create policy staff_all_lig    on bar_lignes     for all to authenticated using (true) with check (true);

revoke all on function bar_menu(uuid)                     from public;
revoke all on function bar_passer_commande(uuid, jsonb, text) from public;
revoke all on function bar_suivi(uuid)                    from public;
grant execute on function bar_menu(uuid)                     to anon, authenticated;
grant execute on function bar_passer_commande(uuid, jsonb, text) to anon, authenticated;
grant execute on function bar_suivi(uuid)                    to anon, authenticated;

-- Realtime pour l'écran bar
alter publication supabase_realtime add table bar_commandes;
alter publication supabase_realtime add table bar_lignes;

-- ----------- 5. VUE DE RÉCONCILIATION ----------------------

create or replace view bar_recap_soiree as
select
  date_trunc('day', c.created_at - interval '6 hours') as soiree,
  count(*) filter (where c.statut = 'servie')          as commandes_servies,
  sum(c.cases_dues) filter (where c.statut = 'servie') as cases_consommees,
  round(sum(c.cases_dues) filter (where c.statut = 'servie') * 0.5, 2) as euros_equivalents,
  count(*) filter (where c.statut = 'annulee')         as annulees
from bar_commandes c
group by 1 order by 1 desc;

create or replace view bar_recap_articles as
select l.libelle,
       sum(l.quantite)                    as quantite_vendue,
       sum(l.quantite * l.prix_cases)     as cases_generees
from bar_lignes l
join bar_commandes c on c.id = l.commande_id and c.statut = 'servie'
group by 1 order by 2 desc;

-- ----------- 6. SEED MINIMAL -------------------------------
-- À adapter ensuite via les formulaires CRUD de l'app, pas ici.

insert into bar_categories(nom, ordre) values
  ('Bières', 1), ('Softs', 2), ('Vins & apéritifs', 3), ('Petite restauration', 4)
on conflict do nothing;

insert into bar_articles(categorie_id, nom, prix_cases, ordre)
select c.id, v.nom, v.prix, v.ordre
from (values
  ('Bières','Pils 25cl', 4, 1),
  ('Bières','Bière spéciale 33cl', 6, 2),
  ('Softs','Eau plate 50cl', 3, 1),
  ('Softs','Soda 33cl', 4, 2),
  ('Vins & apéritifs','Verre de vin', 6, 1),
  ('Petite restauration','Portion frites', 6, 1)
) as v(cat, nom, prix, ordre)
join bar_categories c on c.nom = v.cat
on conflict do nothing;

-- 20 tables numérotées, chacune avec son token unique
insert into bar_tables(numero, zone)
select 'T' || lpad(i::text, 2, '0'), 'Salle'
from generate_series(1, 20) i
on conflict (numero) do nothing;

-- Récupérer les URL des QR à imprimer :
-- select numero, 'https://TON-APP.vercel.app/c/' || token from bar_tables order by numero;

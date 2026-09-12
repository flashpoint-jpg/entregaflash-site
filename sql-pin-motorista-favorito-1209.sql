-- Entrega Flash — PIN de entrega + motorista favorito
-- 12/09/2026

alter table public.entrega_pedidos
  add column if not exists motorista_preferido_telefone text,
  add column if not exists preferencia_exclusiva_ate bigint;

create index if not exists idx_entrega_pedidos_motorista_preferido
  on public.entrega_pedidos (motorista_preferido_telefone)
  where motorista_preferido_telefone is not null;

create table if not exists public.entrega_clientes_motoristas_favoritos (
  cliente_telefone text not null,
  motorista_telefone text not null,
  criado_em bigint not null default ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  primary key (cliente_telefone, motorista_telefone)
);

alter table public.entrega_clientes_motoristas_favoritos enable row level security;
revoke all on table public.entrega_clientes_motoristas_favoritos from anon, authenticated;

create or replace function public.entrega_cliente_favoritar_motorista(
  p_cliente_telefone text,
  p_motorista_telefone text,
  p_favoritar boolean default true
)
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare
  v_cliente text := regexp_replace(coalesce(p_cliente_telefone,''), '[^0-9]', '', 'g');
  v_motorista text := regexp_replace(coalesce(p_motorista_telefone,''), '[^0-9]', '', 'g');
begin
  if length(v_cliente) < 10 or length(v_motorista) < 10 then
    raise exception 'telefone_invalido';
  end if;

  if coalesce(p_favoritar,true) then
    if not exists (
      select 1
      from public.entrega_pedidos p
      where p.status='entregue'
        and regexp_replace(coalesce(p.cliente_telefone,''), '[^0-9]', '', 'g')=v_cliente
        and regexp_replace(coalesce(p.motorista_telefone,''), '[^0-9]', '', 'g')=v_motorista
    ) then
      raise exception 'motorista_sem_entrega_concluida_com_cliente';
    end if;

    if not exists (
      select 1 from public.entrega_motoristas m
      where regexp_replace(coalesce(m.telefone,''), '[^0-9]', '', 'g')=v_motorista
        and m.status='aprovado'
    ) then
      raise exception 'motorista_indisponivel';
    end if;

    insert into public.entrega_clientes_motoristas_favoritos(cliente_telefone,motorista_telefone)
    values(v_cliente,v_motorista)
    on conflict(cliente_telefone,motorista_telefone) do nothing;
  else
    delete from public.entrega_clientes_motoristas_favoritos
    where cliente_telefone=v_cliente and motorista_telefone=v_motorista;
  end if;

  return true;
end;
$function$;

grant execute on function public.entrega_cliente_favoritar_motorista(text,text,boolean) to anon, authenticated;

create or replace function public.entrega_cliente_listar_motoristas_favoritos(p_cliente_telefone text)
returns table(
  motorista_telefone text,
  nome text,
  veiculo_tipo text,
  veiculo_marca text,
  veiculo_placa text,
  veiculo_cor text,
  foto_motorista_url text,
  nota_media numeric,
  total_avaliacoes integer,
  online boolean,
  criado_em bigint
)
language sql
security definer
set search_path to 'public','pg_catalog'
as $function$
  select
    regexp_replace(coalesce(m.telefone,''), '[^0-9]', '', 'g') as motorista_telefone,
    m.nome,
    m.veiculo_tipo,
    m.veiculo_marca,
    m.veiculo_placa,
    m.veiculo_cor,
    m.foto_motorista_url,
    coalesce(m.nota_media,5)::numeric as nota_media,
    coalesce(m.total_avaliacoes,0)::integer as total_avaliacoes,
    (
      m.status='aprovado'
      and coalesce(m.disponivel,false)=true
      and m.lat_atual is not null
      and m.lng_atual is not null
      and coalesce(m.lat_atualizado_em,0) >= ((extract(epoch from clock_timestamp())*1000)::bigint - 5*60*1000)
      and exists(
        select 1 from public.push_subscriptions s
        where s.papel='motorista'
          and regexp_replace(coalesce(s.referencia,''), '[^0-9]', '', 'g') = regexp_replace(coalesce(m.telefone,''), '[^0-9]', '', 'g')
      )
    ) as online,
    f.criado_em
  from public.entrega_clientes_motoristas_favoritos f
  join public.entrega_motoristas m
    on regexp_replace(coalesce(m.telefone,''), '[^0-9]', '', 'g')=f.motorista_telefone
  where f.cliente_telefone=regexp_replace(coalesce(p_cliente_telefone,''), '[^0-9]', '', 'g')
    and m.status='aprovado'
  order by online desc, coalesce(m.nota_media,5) desc, f.criado_em desc;
$function$;

grant execute on function public.entrega_cliente_listar_motoristas_favoritos(text) to anon, authenticated;

-- PIN nunca fica salvo em texto puro: o navegador do cliente guarda os 4 dígitos localmente
-- e o banco guarda somente o hash bcrypt no campo já existente pin_entrega.
create or replace function public.entrega_definir_pin_entrega(
  p_pedido_id text,
  p_cliente_telefone text,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path to 'public','extensions','pg_catalog'
as $function$
declare
  v_ok integer := 0;
  v_cliente text := regexp_replace(coalesce(p_cliente_telefone,''), '[^0-9]', '', 'g');
begin
  if coalesce(p_pin,'') !~ '^[0-9]{4}$' then
    raise exception 'pin_invalido';
  end if;

  update public.entrega_pedidos
     set pin_entrega = extensions.crypt(p_pin, extensions.gen_salt('bf',10)),
         pin_confirmado_em = null,
         pin_confirmado_lat = null,
         pin_confirmado_lng = null,
         atualizado_em = (extract(epoch from clock_timestamp())*1000)::bigint
   where id=p_pedido_id
     and regexp_replace(coalesce(cliente_telefone,''), '[^0-9]', '', 'g')=v_cliente
     and status in ('aguardando_pagamento','buscando');

  get diagnostics v_ok = row_count;
  return v_ok=1;
end;
$function$;

grant execute on function public.entrega_definir_pin_entrega(text,text,text) to anon, authenticated;

create or replace function public.entrega_confirmar_pin_entrega(
  p_pedido_id text,
  p_motorista_telefone text,
  p_pin text,
  p_lat double precision default null,
  p_lng double precision default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public','extensions','pg_catalog'
as $function$
declare
  v_ok integer := 0;
  v_motorista text := regexp_replace(coalesce(p_motorista_telefone,''), '[^0-9]', '', 'g');
begin
  if coalesce(p_pin,'') !~ '^[0-9]{4}$' then
    return false;
  end if;

  update public.entrega_pedidos
     set pin_confirmado_em=(extract(epoch from clock_timestamp())*1000)::bigint,
         pin_confirmado_lat=p_lat,
         pin_confirmado_lng=p_lng,
         atualizado_em=(extract(epoch from clock_timestamp())*1000)::bigint
   where id=p_pedido_id
     and regexp_replace(coalesce(motorista_telefone,''), '[^0-9]', '', 'g')=v_motorista
     and status='a_caminho'
     and pin_entrega is not null
     and extensions.crypt(p_pin,pin_entrega)=pin_entrega
     and pin_confirmado_em is null;

  get diagnostics v_ok = row_count;
  return v_ok=1;
end;
$function$;

grant execute on function public.entrega_confirmar_pin_entrega(text,text,text,double precision,double precision) to anon, authenticated;

create or replace function public.entrega_exigir_pin_antes_concluir()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status='entregue'
     and old.status is distinct from 'entregue'
     and coalesce(new.tipo_entrega,'padrao') <> 'vendai_marketplace'
     and (new.pin_entrega is null or new.pin_confirmado_em is null) then
    raise exception 'pin_entrega_nao_confirmado';
  end if;
  return new;
end;
$function$;

-- Valida o favorito escolhido e abre uma janela exclusiva de 30 s somente
-- quando o pedido realmente entra em busca. Se o favorito estiver offline,
-- sem GPS recente ou sem push, a preferência é removida e a busca normal começa na hora.
create or replace function public.entrega_preparar_preferencia_motorista()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare
  v_cliente text;
  v_motorista text;
  v_agora bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  v_relacao_ok boolean := false;
  v_online_ok boolean := false;
begin
  v_cliente := regexp_replace(coalesce(new.cliente_telefone,''), '[^0-9]', '', 'g');
  v_motorista := regexp_replace(coalesce(new.motorista_preferido_telefone,''), '[^0-9]', '', 'g');

  if v_motorista='' then
    new.motorista_preferido_telefone := null;
    new.preferencia_exclusiva_ate := null;
    return new;
  end if;

  select exists(
    select 1
    from public.entrega_clientes_motoristas_favoritos f
    join public.entrega_motoristas m
      on regexp_replace(coalesce(m.telefone,''), '[^0-9]', '', 'g')=f.motorista_telefone
    where f.cliente_telefone=v_cliente
      and f.motorista_telefone=v_motorista
      and m.status='aprovado'
      and m.veiculo_tipo=new.veiculo
  ) into v_relacao_ok;

  if not coalesce(v_relacao_ok,false) then
    new.motorista_preferido_telefone := null;
    new.preferencia_exclusiva_ate := null;
    return new;
  end if;

  new.motorista_preferido_telefone := v_motorista;

  if new.status='buscando' and (tg_op='INSERT' or old.status is distinct from 'buscando') then
    -- Se voltou para a fila porque uma corrida já aceita foi cancelada pelo motorista,
    -- não prende o cliente novamente ao mesmo favorito.
    if tg_op='UPDATE' and old.status in ('indo_coletar','coletado','a_caminho') then
      new.motorista_preferido_telefone := null;
      new.preferencia_exclusiva_ate := null;
      return new;
    end if;

    select exists(
      select 1
      from public.entrega_motoristas m
      where regexp_replace(coalesce(m.telefone,''), '[^0-9]', '', 'g')=v_motorista
        and m.status='aprovado'
        and coalesce(m.disponivel,false)=true
        and m.veiculo_tipo=new.veiculo
        and m.lat_atual is not null
        and m.lng_atual is not null
        and coalesce(m.lat_atualizado_em,0) >= (v_agora - 5*60*1000)
        and exists(
          select 1 from public.push_subscriptions s
          where s.papel='motorista'
            and regexp_replace(coalesce(s.referencia,''), '[^0-9]', '', 'g')=v_motorista
        )
    ) into v_online_ok;

    if coalesce(v_online_ok,false) then
      new.preferencia_exclusiva_ate := v_agora + 30000;
    else
      new.motorista_preferido_telefone := null;
      new.preferencia_exclusiva_ate := null;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_entrega_preparar_preferencia_insert on public.entrega_pedidos;
create trigger trg_entrega_preparar_preferencia_insert
before insert on public.entrega_pedidos
for each row execute function public.entrega_preparar_preferencia_motorista();

drop trigger if exists trg_entrega_preparar_preferencia_update on public.entrega_pedidos;
create trigger trg_entrega_preparar_preferencia_update
before update of status,motorista_preferido_telefone,veiculo on public.entrega_pedidos
for each row execute function public.entrega_preparar_preferencia_motorista();

create or replace function public.entrega_bloquear_aceite_fora_preferencia()
returns trigger
language plpgsql
set search_path to 'public','pg_catalog'
as $function$
declare
  v_agora bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  v_preferido text := regexp_replace(coalesce(old.motorista_preferido_telefone,''), '[^0-9]', '', 'g');
  v_novo text := regexp_replace(coalesce(new.motorista_telefone,''), '[^0-9]', '', 'g');
begin
  if old.status='buscando'
     and new.status='indo_coletar'
     and v_preferido<>''
     and coalesce(old.preferencia_exclusiva_ate,0)>v_agora
     and v_novo<>v_preferido then
    raise exception 'pedido_reservado_motorista_favorito';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_entrega_bloquear_aceite_fora_preferencia on public.entrega_pedidos;
create trigger trg_entrega_bloquear_aceite_fora_preferencia
before update of status,motorista_telefone on public.entrega_pedidos
for each row execute function public.entrega_bloquear_aceite_fora_preferencia();

create or replace function public.entrega_despachar_pedido(p_pedido_id text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog','net'
as $function$
declare
  v_p record;
  v_m record;
  v_idade_seg numeric;
  v_raio numeric;
  v_dist double precision;
  v_atraso_free integer:=15;
  v_tel text;
  v_inseriu boolean;
  v_chamadas integer:=0;
  v_sem_push integer:=0;
  v_pedidos integer:=0;
  v_titulo text;
  v_corpo text;
  v_agora_ms bigint;
  v_preferido text;
  v_preferencia_ativa boolean;
  v_inicio_busca_ms bigint;
begin
  select coalesce(atraso_prioridade_pro_seg,15)
    into v_atraso_free
  from public.entrega_config_geral where id=1;
  v_atraso_free:=coalesce(v_atraso_free,15);

  for v_p in
    select id,origem,destino,veiculo,preco,criado_em,origem_lat,origem_lng,
           prioridade,tipo_entrega,motorista_preferido_telefone,preferencia_exclusiva_ate
    from public.entrega_pedidos
    where status='buscando' and (p_pedido_id is null or id=p_pedido_id)
  loop
    v_pedidos:=v_pedidos+1;
    v_agora_ms := (extract(epoch from clock_timestamp())*1000)::bigint;
    v_preferido := regexp_replace(coalesce(v_p.motorista_preferido_telefone,''), '[^0-9]', '', 'g');
    v_preferencia_ativa := v_preferido<>'' and coalesce(v_p.preferencia_exclusiva_ate,0)>v_agora_ms;

    -- Janela exclusiva: toca primeiro e somente para o favorito escolhido.
    if v_preferencia_ativa then
      select telefone,nome,plano,lat_atual,lng_atual
        into v_m
      from public.entrega_motoristas
      where regexp_replace(coalesce(telefone,''), '[^0-9]', '', 'g')=v_preferido
        and status='aprovado'
        and disponivel=true
        and veiculo_tipo=v_p.veiculo
        and lat_atual is not null
        and lng_atual is not null
        and lat_atualizado_em >= (v_agora_ms - 5*60*1000)
      limit 1;

      if found and exists(
        select 1 from public.push_subscriptions s
        where s.papel='motorista'
          and regexp_replace(coalesce(s.referencia,''), '[^0-9]', '', 'g')=v_preferido
      ) then
        v_dist:=case when v_p.origem_lat is not null and v_p.origem_lng is not null
                       then public.entrega_distancia_km(v_m.lat_atual::double precision,v_m.lng_atual::double precision,v_p.origem_lat::double precision,v_p.origem_lng::double precision)
                     else null end;
        v_inseriu:=false;
        insert into public.entrega_pedido_chamadas(pedido_id,motorista_telefone,faixa_km)
        values(v_p.id,v_preferido,null)
        on conflict(pedido_id,motorista_telefone) do nothing
        returning true into v_inseriu;

        if coalesce(v_inseriu,false) then
          v_titulo:='⭐ Cliente chamou você!';
          v_corpo:=coalesce(v_p.origem,'Origem')||' → '||coalesce(v_p.destino,'Destino')||' · R$ '||to_char(coalesce(v_p.preco,0),'FM999999990D00')||' · chamada de favorito';
          perform net.http_post(
            url:='https://rgcclordmqjmwuzrrfbd.supabase.co/functions/v1/enviar-push',
            headers:='{"Content-Type":"application/json"}'::jsonb,
            body:=jsonb_build_object('papel','motorista','referencia',v_preferido,'title',v_titulo,'body',v_corpo,'url','/?ir=login-motorista&pedido='||v_p.id,'tipo','pedido_favorito')
          );
          v_chamadas:=v_chamadas+1;
        end if;
        -- Mesmo se a push já foi criada em execução anterior, ninguém mais é chamado
        -- enquanto a janela exclusiva estiver ativa.
        continue;
      else
        update public.entrega_pedidos
           set motorista_preferido_telefone=null,
               preferencia_exclusiva_ate=null,
               atualizado_em=v_agora_ms
         where id=v_p.id and status='buscando';
        v_preferido:='';
        v_preferencia_ativa:=false;
        v_inicio_busca_ms:=v_p.criado_em;
      end if;
    end if;

    -- Quando a janela do favorito terminou, o relógio da busca normal começa dali.
    if v_inicio_busca_ms is null then
      v_inicio_busca_ms:=coalesce(v_p.preferencia_exclusiva_ate,v_p.criado_em);
    end if;
    v_idade_seg:=greatest(0,extract(epoch from clock_timestamp())-(coalesce(v_inicio_busca_ms,0)::numeric/1000.0));

    if v_idade_seg<30 then v_raio:=10;
    elsif v_idade_seg<90 then v_raio:=20;
    elsif v_idade_seg<180 then v_raio:=40;
    elsif coalesce(v_p.tipo_entrega,'')='vendai_marketplace' then v_raio:=60;
    else v_raio:=null;
    end if;

    for v_m in
      select telefone,nome,plano,lat_atual,lng_atual
      from public.entrega_motoristas
      where status='aprovado'
        and disponivel=true
        and veiculo_tipo=v_p.veiculo
        and lat_atual is not null
        and lng_atual is not null
        and lat_atualizado_em >= ((extract(epoch from clock_timestamp())*1000)::bigint - 5*60*1000)
        and (coalesce(v_p.prioridade,false)=true or lower(coalesce(plano,'free'))='pro' or v_idade_seg>=v_atraso_free)
    loop
      v_tel:=regexp_replace(coalesce(v_m.telefone,''),'[^0-9]','','g');
      if v_tel='' then continue; end if;

      if v_raio is not null then
        if v_p.origem_lat is null or v_p.origem_lng is null or v_m.lat_atual is null or v_m.lng_atual is null then continue; end if;
        v_dist:=public.entrega_distancia_km(v_m.lat_atual::double precision,v_m.lng_atual::double precision,v_p.origem_lat::double precision,v_p.origem_lng::double precision);
        if v_dist>v_raio then continue; end if;
      else
        v_dist:=case when v_p.origem_lat is not null and v_p.origem_lng is not null and v_m.lat_atual is not null and v_m.lng_atual is not null
                     then public.entrega_distancia_km(v_m.lat_atual::double precision,v_m.lng_atual::double precision,v_p.origem_lat::double precision,v_p.origem_lng::double precision)
                     else null end;
      end if;

      if not exists(
        select 1 from public.push_subscriptions s
        where s.papel='motorista'
          and regexp_replace(coalesce(s.referencia,''),'[^0-9]','','g')=v_tel
      ) then
        v_sem_push:=v_sem_push+1;
        continue;
      end if;

      v_inseriu:=false;
      insert into public.entrega_pedido_chamadas(pedido_id,motorista_telefone,faixa_km)
      values(v_p.id,v_tel,case when v_raio is null then null else v_raio::integer end)
      on conflict(pedido_id,motorista_telefone) do nothing
      returning true into v_inseriu;

      if coalesce(v_inseriu,false) then
        v_titulo:=case when v_dist is not null and v_dist<=15 then '🆕 Pedido perto de você!' else '🆕 Novo pedido disponível!' end;
        v_corpo:=coalesce(v_p.origem,'Origem')||' → '||coalesce(v_p.destino,'Destino')||' · R$ '||to_char(coalesce(v_p.preco,0),'FM999999990D00');
        perform net.http_post(
          url:='https://rgcclordmqjmwuzrrfbd.supabase.co/functions/v1/enviar-push',
          headers:='{"Content-Type":"application/json"}'::jsonb,
          body:=jsonb_build_object('papel','motorista','referencia',v_tel,'title',v_titulo,'body',v_corpo,'url','/?ir=login-motorista&pedido='||v_p.id,'tipo','novo_pedido')
        );
        v_chamadas:=v_chamadas+1;
      end if;
    end loop;

    v_inicio_busca_ms:=null;
  end loop;

  return jsonb_build_object('ok',true,'pedidos',v_pedidos,'chamadas',v_chamadas,'sem_push',v_sem_push);
end;
$function$;

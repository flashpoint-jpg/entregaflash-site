-- Funções usadas pelo APK nativo (GPS e chamada em segundo plano).
-- Copiadas do projeto antigo (flashcred / rgcclordmqjmwuzrrfbd) em 02/10/2026,
-- pois não foram levadas na migração para o projeto "entrega flash".

create or replace function public.entrega_distancia_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
 returns double precision
 language sql
 immutable strict
 set search_path to 'pg_catalog'
as $function$
  select 6371.0 * 2.0 * asin(
    sqrt(
      power(sin(radians((p_lat2 - p_lat1) / 2.0)), 2) +
      cos(radians(p_lat1)) * cos(radians(p_lat2)) *
      power(sin(radians((p_lng2 - p_lng1) / 2.0)), 2)
    )
  );
$function$;

create or replace function public.entrega_motorista_aceitar_pedido(p_id text, p_motorista_telefone text, p_acrescimo_valor numeric default 0, p_acrescimo_motivos jsonb default '[]'::jsonb)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_m public.entrega_motoristas%rowtype; v_p public.entrega_pedidos%rowtype; v_agora bigint:=(extract(epoch from now())*1000)::bigint; v_linhas integer:=0; v_acrescimo numeric; v_motivos jsonb;
begin
  select * into v_m from public.entrega_motoristas where telefone=p_motorista_telefone and status in ('aprovado','liberado') limit 1; if not found then return false; end if;
  select * into v_p from public.entrega_pedidos where id=p_id limit 1; if v_p.id is null then return false; end if;
  if coalesce(v_p.tipo_entrega,'padrao')='vendai_marketplace' then v_acrescimo:=0; v_motivos:='[]'::jsonb; else v_acrescimo:=greatest(coalesce(p_acrescimo_valor,0),0); v_motivos:=coalesce(p_acrescimo_motivos,'[]'::jsonb); end if;
  perform set_config('app.entrega_admin_ok','true',true);
  update public.entrega_pedidos set status='indo_coletar',motorista_nome=v_m.nome,motorista_telefone=v_m.telefone,atualizado_em=v_agora,motorista_foto_url=v_m.foto_motorista_url,motorista_veiculo_tipo=v_m.veiculo_tipo,motorista_marca=v_m.veiculo_marca,motorista_cor=v_m.veiculo_cor,motorista_placa=v_m.veiculo_placa,motorista_nota_media=coalesce(v_m.nota_media,5),motorista_total_avaliacoes=coalesce(v_m.total_avaliacoes,0),iniciado_em=null,aceito_em=v_agora,acrescimo_valor=v_acrescimo,acrescimo_motivos=v_motivos,preco=coalesce(preco,0)+v_acrescimo where id=p_id and status='buscando';
  get diagnostics v_linhas=row_count; return v_linhas=1;
end $function$;

create or replace function public.entrega_motorista_background_ping(p_telefone text, p_lat numeric, p_lng numeric)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_agora bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_ok boolean := false;
begin
  if nullif(regexp_replace(coalesce(p_telefone,''),'\D','','g'),'') is null
     or p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90
     or p_lng < -180 or p_lng > 180 then
    return false;
  end if;

  perform set_config('app.entrega_admin_ok','true',true);

  update public.entrega_motoristas
     set lat_atual = p_lat,
         lng_atual = p_lng,
         lat_atualizado_em = v_agora,
         disponivel = true,
         disponivel_atualizado_em = v_agora,
         atualizado_em = v_agora
   where regexp_replace(coalesce(telefone,''),'\D','','g') =
         regexp_replace(coalesce(p_telefone,''),'\D','','g')
     and status = 'aprovado';

  v_ok := found;

  if v_ok then
    update public.entrega_pedidos
       set motorista_lat = p_lat,
           motorista_lng = p_lng,
           motorista_atualizado_em = v_agora
     where regexp_replace(coalesce(motorista_telefone,''),'\D','','g') =
           regexp_replace(coalesce(p_telefone,''),'\D','','g')
       and status in ('indo_coletar','coletado','a_caminho');
  end if;

  return v_ok;
end;
$function$;

create or replace function public.entrega_motorista_definir_disponivel_com_posicao(p_telefone text, p_disponivel boolean, p_lat numeric default null::numeric, p_lng numeric default null::numeric)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
    v_agora bigint := (extract(epoch from now())*1000)::bigint;
begin
    if p_disponivel and p_lat is not null and p_lng is not null then
        update public.entrega_motoristas
        set disponivel = true, disponivel_atualizado_em = v_agora,
            lat_atual = p_lat, lng_atual = p_lng, lat_atualizado_em = v_agora
        where telefone = p_telefone;
    else
        update public.entrega_motoristas
        set disponivel = p_disponivel, disponivel_atualizado_em = v_agora
        where telefone = p_telefone;
    end if;
    return true;
end;
$function$;

create or replace function public.entrega_motorista_background_pedido_disponivel(p_id text, p_telefone text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_catalog'
as $function$
  select exists(
    select 1
    from public.entrega_pedidos p
    join public.entrega_motoristas m
      on regexp_replace(coalesce(m.telefone,''),'[^0-9]','','g') =
         regexp_replace(coalesce(p_telefone,''),'[^0-9]','','g')
    where p.id=p_id
      and p.status='buscando'
      and m.status='aprovado'
      and coalesce(m.disponivel,false)=true
      and m.lat_atual is not null
      and m.lng_atual is not null
      and coalesce(m.lat_atualizado_em,0) >= ((extract(epoch from clock_timestamp())*1000)::bigint - 5*60*1000)
      and p.veiculo=m.veiculo_tipo
      and (
        nullif(regexp_replace(coalesce(p.motorista_preferido_telefone,''),'[^0-9]','','g'),'') is null
        or coalesce(p.preferencia_exclusiva_ate,0) <= (extract(epoch from clock_timestamp())*1000)::bigint
        or regexp_replace(coalesce(p.motorista_preferido_telefone,''),'[^0-9]','','g') =
           regexp_replace(coalesce(p_telefone,''),'[^0-9]','','g')
      )
  );
$function$;

create or replace function public.entrega_motorista_background_proximo_pedido(p_telefone text, p_ignorar_ids jsonb default '[]'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_tel text := regexp_replace(coalesce(p_telefone,''),'[^0-9]','','g');
  v_m public.entrega_motoristas%rowtype;
  v_p record;
  v_agora bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  v_atraso_free integer := 15;
begin
  if v_tel='' then return null; end if;

  select * into v_m
  from public.entrega_motoristas
  where regexp_replace(coalesce(telefone,''),'[^0-9]','','g')=v_tel
    and status='aprovado'
    and coalesce(disponivel,false)=true
  limit 1;

  if not found then return null; end if;
  if v_m.lat_atual is null or v_m.lng_atual is null
     or coalesce(v_m.lat_atualizado_em,0) < (v_agora - 5*60*1000) then
    return null;
  end if;

  select coalesce(atraso_prioridade_pro_seg,15)
    into v_atraso_free
  from public.entrega_config_geral
  where id=1;

  with candidatos as (
    select
      p.*,
      greatest(0, (v_agora - coalesce(
        case
          when nullif(regexp_replace(coalesce(p.motorista_preferido_telefone,''),'[^0-9]','','g'),'') is not null
               and coalesce(p.preferencia_exclusiva_ate,0) > 0
            then p.preferencia_exclusiva_ate
          else p.criado_em
        end, p.criado_em, v_agora
      )) / 1000.0) as idade_busca_seg,
      case
        when p.origem_lat is not null and p.origem_lng is not null then
          public.entrega_distancia_km(
            v_m.lat_atual::double precision,
            v_m.lng_atual::double precision,
            p.origem_lat::double precision,
            p.origem_lng::double precision
          )
        else null
      end as distancia_ate_motorista
    from public.entrega_pedidos p
    where p.status='buscando'
      and p.veiculo=v_m.veiculo_tipo
      and not exists (
        select 1
        from jsonb_array_elements_text(coalesce(p_ignorar_ids,'[]'::jsonb)) x(id)
        where x.id=p.id
      )
      and (
        nullif(regexp_replace(coalesce(p.motorista_preferido_telefone,''),'[^0-9]','','g'),'') is null
        or coalesce(p.preferencia_exclusiva_ate,0) <= v_agora
        or regexp_replace(coalesce(p.motorista_preferido_telefone,''),'[^0-9]','','g')=v_tel
      )
  ),
  filtrados as (
    select c.*,
      case
        when c.idade_busca_seg < 30 then 10::numeric
        when c.idade_busca_seg < 90 then 20::numeric
        when c.idade_busca_seg < 180 then 40::numeric
        when coalesce(c.tipo_entrega,'')='vendai_marketplace' then 60::numeric
        else null::numeric
      end as raio_dispatch_km
    from candidatos c
    where coalesce(c.prioridade,false)=true
       or lower(coalesce(v_m.plano,'free'))='pro'
       or c.idade_busca_seg >= coalesce(v_atraso_free,15)
  ),
  elegiveis as (
    select f.*,
      case
        when coalesce(v_m.raio_atendimento_km,0)>0 and f.raio_dispatch_km is not null
          then least(v_m.raio_atendimento_km::numeric,f.raio_dispatch_km)
        when coalesce(v_m.raio_atendimento_km,0)>0
          then v_m.raio_atendimento_km::numeric
        else f.raio_dispatch_km
      end as limite_km
    from filtrados f
  )
  select * into v_p
  from elegiveis e
  where e.limite_km is null
     or (e.distancia_ate_motorista is not null and e.distancia_ate_motorista <= e.limite_km)
  order by coalesce(e.prioridade_valor,0) desc,
           e.distancia_ate_motorista nulls last,
           e.criado_em asc
  limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'id',v_p.id,
    'origem',v_p.origem,
    'destino',v_p.destino,
    'preco',coalesce(v_p.preco,0),
    'distancia',coalesce(v_p.distancia,0),
    'distancia_ate_motorista',v_p.distancia_ate_motorista,
    'veiculo',v_p.veiculo,
    'descricao',coalesce(v_p.descricao,''),
    'prioridade',coalesce(v_p.prioridade,false),
    'prioridade_valor',coalesce(v_p.prioridade_valor,0),
    'extra_ajudante',coalesce(v_p.extra_ajudante,false),
    'extra_bag_termica',coalesce(v_p.extra_bag_termica,false),
    'extra_embalagem',coalesce(v_p.extra_embalagem,false),
    'extra_carga_pesada',coalesce(v_p.extra_carga_pesada,false),
    'extra_urgente',coalesce(v_p.extra_urgente,false),
    'criado_em',v_p.criado_em
  );
end;
$function$;

create or replace function public.entrega_motorista_background_aceitar_pedido(p_id text, p_telefone text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_tel text := regexp_replace(coalesce(p_telefone,''),'[^0-9]','','g');
  v_m public.entrega_motoristas%rowtype;
  v_p public.entrega_pedidos%rowtype;
  v_cfg public.entrega_config_geral%rowtype;
  v_agora bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
  v_ativos integer := 0;
  v_limite_simultaneo integer := 1;
  v_ok boolean := false;
  v_hora integer;
  v_motivos jsonb := '[]'::jsonb;
  v_acrescimo numeric := 0;
begin
  if v_tel='' or coalesce(trim(p_id),'')='' then
    return jsonb_build_object('ok',false,'motivo','dados_invalidos');
  end if;

  select * into v_m
  from public.entrega_motoristas
  where regexp_replace(coalesce(telefone,''),'[^0-9]','','g')=v_tel
    and status='aprovado'
  limit 1;

  if not found or not coalesce(v_m.disponivel,false) then
    return jsonb_build_object('ok',false,'motivo','motorista_offline');
  end if;
  if v_m.lat_atual is null or v_m.lng_atual is null
     or coalesce(v_m.lat_atualizado_em,0) < (v_agora - 5*60*1000) then
    return jsonb_build_object('ok',false,'motivo','gps_desatualizado');
  end if;

  select * into v_p
  from public.entrega_pedidos
  where id=p_id
  for update;

  if not found or v_p.status<>'buscando' then
    return jsonb_build_object('ok',false,'motivo','pedido_indisponivel');
  end if;

  if coalesce(v_p.veiculo,'')<>coalesce(v_m.veiculo_tipo,'') then
    return jsonb_build_object('ok',false,'motivo','veiculo_incompativel');
  end if;

  if nullif(regexp_replace(coalesce(v_p.motorista_preferido_telefone,''),'[^0-9]','','g'),'') is not null
     and coalesce(v_p.preferencia_exclusiva_ate,0)>v_agora
     and regexp_replace(coalesce(v_p.motorista_preferido_telefone,''),'[^0-9]','','g')<>v_tel then
    return jsonb_build_object('ok',false,'motivo','pedido_reservado');
  end if;

  select * into v_cfg from public.entrega_config_geral where id=1;
  v_limite_simultaneo := case
    when lower(coalesce(v_m.plano,'free'))='pro' then coalesce(v_cfg.pro_limite_simultaneo,15)
    else coalesce(v_cfg.free_limite_simultaneo,8)
  end;

  select count(*) into v_ativos
  from public.entrega_pedidos
  where regexp_replace(coalesce(motorista_telefone,''),'[^0-9]','','g')=v_tel
    and status in ('indo_coletar','coletado','a_caminho');

  if v_ativos>=v_limite_simultaneo then
    return jsonb_build_object('ok',false,'motivo','limite_simultaneo');
  end if;

  if lower(coalesce(v_m.plano,'free'))<>'pro'
     and not coalesce(v_p.prioridade,false)
     and greatest(0,(v_agora-coalesce(v_p.criado_em,v_agora))/1000.0) < coalesce(v_cfg.atraso_prioridade_pro_seg,15) then
    return jsonb_build_object('ok',false,'motivo','aguarde_prioridade');
  end if;

  v_ok := public.entrega_motorista_aceitar_pedido(v_p.id,v_m.telefone,0,'[]'::jsonb);
  if not coalesce(v_ok,false) then
    return jsonb_build_object('ok',false,'motivo','pedido_indisponivel');
  end if;

  if lower(coalesce(v_m.plano,'free'))='pro'
     and coalesce(v_p.tipo_entrega,'padrao')<>'vendai_marketplace' then

    v_hora := extract(hour from (clock_timestamp() at time zone 'America/Sao_Paulo'))::integer;

    if (
      coalesce(v_cfg.acrescimo_noturno_hora_inicio,22) > coalesce(v_cfg.acrescimo_noturno_hora_fim,6)
      and (v_hora >= coalesce(v_cfg.acrescimo_noturno_hora_inicio,22)
           or v_hora < coalesce(v_cfg.acrescimo_noturno_hora_fim,6))
    ) or (
      coalesce(v_cfg.acrescimo_noturno_hora_inicio,22) <= coalesce(v_cfg.acrescimo_noturno_hora_fim,6)
      and v_hora >= coalesce(v_cfg.acrescimo_noturno_hora_inicio,22)
      and v_hora < coalesce(v_cfg.acrescimo_noturno_hora_fim,6)
    ) then
      v_motivos := v_motivos || jsonb_build_array('noturno');
    end if;

    if coalesce(v_cfg.acrescimo_chuva_ativo,false) then
      v_motivos := v_motivos || jsonb_build_array('chuva');
    end if;

    if coalesce(v_cfg.acrescimo_feriado_ativo,false) then
      v_motivos := v_motivos || jsonb_build_array('feriado');
    end if;

    if jsonb_array_length(v_motivos)>0 then
      v_acrescimo := round((coalesce(v_p.preco,0) * coalesce(v_cfg.acrescimo_noturno_pct,25) / 100)::numeric,2);
      begin
        perform public.entrega_aplicar_acrescimo_saldo_pedido(
          v_p.id,
          v_p.cliente_telefone,
          v_acrescimo,
          v_motivos
        );
      exception when others then
        v_acrescimo := 0;
        v_motivos := '[]'::jsonb;
      end;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'pedido_id',v_p.id,
    'acrescimo_valor',v_acrescimo,
    'acrescimo_motivos',v_motivos
  );
end;
$function$;

grant execute on function public.entrega_motorista_background_ping(text,numeric,numeric) to anon, authenticated;
grant execute on function public.entrega_motorista_definir_disponivel_com_posicao(text,boolean,numeric,numeric) to anon, authenticated;
grant execute on function public.entrega_motorista_background_pedido_disponivel(text,text) to anon, authenticated;
grant execute on function public.entrega_motorista_background_proximo_pedido(text,jsonb) to anon, authenticated;
grant execute on function public.entrega_motorista_background_aceitar_pedido(text,text) to anon, authenticated;

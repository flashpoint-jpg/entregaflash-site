-- Extensao do cadastro empresarial. A API valida a sessao do cliente ou a senha do administrador.
alter table public.entrega_parceiros
  add column if not exists cliente_telefone text references public.entrega_clientes(telefone) on update cascade on delete set null,
  add column if not exists atualizado_em timestamptz not null default now(),
  add column if not exists observacao_admin text;
create unique index if not exists entrega_parceiros_cliente_unico
  on public.entrega_parceiros(cliente_telefone) where cliente_telefone is not null;
create index if not exists entrega_parceiros_status_criado
  on public.entrega_parceiros(status,criado_em desc);
alter table public.entrega_parceiros enable row level security;
-- Formularios antigos continuam podendo enviar contatos, sem atribuir proprietarios ou aprovacoes.
alter policy parceiros_insercao_publica on public.entrega_parceiros
  with check (
    cliente_telefone is null and observacao_admin is null and status='novo'
    and length(trim(estabelecimento)) between 2 and 160
    and length(trim(responsavel)) between 2 and 120
    and whatsapp ~ '^[0-9]{10,11}$'
    and length(trim(cidade)) between 2 and 120
    and tipo_negocio in ('farmacia','mercado','restaurante','loja','petshop','autopecas','floricultura','outro')
  );
grant select,insert,update,delete on public.entrega_parceiros to service_role;

-- Apenas a funcao autenticada publica a visao limitada de uma entrega; nenhum SELECT publico.
create table if not exists public.entrega_rastreios_compartilhados (
  token_hash text primary key check (length(token_hash)=64),
  pedido_id text not null references public.entrega_pedidos(id) on delete cascade,
  cliente_telefone text not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  revogado boolean not null default false
);
create index if not exists entrega_rastreios_pedido on public.entrega_rastreios_compartilhados(pedido_id);
create index if not exists entrega_rastreios_expiracao on public.entrega_rastreios_compartilhados(expira_em);
alter table public.entrega_rastreios_compartilhados enable row level security;
revoke all on public.entrega_rastreios_compartilhados from public,anon,authenticated;
grant select,insert,update,delete on public.entrega_rastreios_compartilhados to service_role;

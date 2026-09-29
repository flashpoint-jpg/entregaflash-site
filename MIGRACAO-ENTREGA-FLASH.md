# Migração do Entrega Flash para o Supabase novo

Este procedimento foi preparado para separar somente o **Entrega Flash** do projeto Supabase antigo.

## O que o workflow copia

Banco:
- tabelas `public.entrega_*`
- `public.push_subscriptions`

O workflow **não** copia:
- tabelas `vendai_*`
- tabelas `flashcred_*`
- `entrega_config_geral` (a configuração de produção já foi migrada)
- tabelas temporárias `entrega_migration_*`

Storage:
- `entrega-fotos`
- `motorista-documentos`

Ele não copia `vendai-fotos`, `leilao-imagens` ou outros buckets.

## Segurança

O workflow é somente manual (`workflow_dispatch`) e exige digitar exatamente:

`MIGRAR`

Ele aborta se o banco novo já tiver motoristas, clientes ou pedidos, evitando uma segunda importação acidental.

Nunca coloque senha de banco ou chave secreta em arquivo, commit, issue ou chat.

## Segredos necessários no GitHub

No repositório `flashpoint-jpg/entregaflash-site`, abra:

**Settings → Secrets and variables → Actions → New repository secret**

Cadastre:

1. `ENTREGA_OLD_DATABASE_URL`
   - conexão PostgreSQL do projeto antigo `flashcred`
2. `ENTREGA_NEW_DATABASE_URL`
   - conexão PostgreSQL do projeto novo `entrega flash`
3. `ENTREGA_OLD_SUPABASE_URL`
   - URL API do projeto antigo
4. `ENTREGA_OLD_SERVICE_ROLE_KEY`
   - chave secreta/server-side do projeto antigo
5. `ENTREGA_NEW_SUPABASE_URL`
   - URL API do projeto novo
6. `ENTREGA_NEW_SERVICE_ROLE_KEY`
   - chave secreta/server-side do projeto novo

As chaves secretas são usadas pelo script apenas para copiar os dois buckets do Storage.

## Executar

Depois de cadastrar os 6 segredos:

1. Abra **Actions** no GitHub.
2. Abra **Migrar Entrega Flash para Supabase novo**.
3. Clique em **Run workflow**.
4. Digite `MIGRAR`.
5. Execute.

## Conferência esperada antes do corte

No snapshot usado durante a preparação da migração, o projeto antigo tinha aproximadamente:

- 241 motoristas
- 9 clientes
- 38 pedidos
- 145 push subscriptions
- 27 arquivos em `entrega-fotos`
- 512 arquivos em `motorista-documentos`

Os números podem aumentar se houver atividade no projeto antigo antes da cópia.

O workflow compara as principais contagens de origem e destino.

## Importante

**Não trocar a URL/chave do app para o Supabase novo antes de a cópia terminar e ser conferida.**

Depois da cópia:
1. conferir contagens;
2. testar login de cliente;
3. testar login de motorista;
4. testar pedido e despacho;
5. testar push;
6. testar Pix Efi;
7. testar painel admin e líder;
8. só então trocar os arquivos do site para o Supabase novo.

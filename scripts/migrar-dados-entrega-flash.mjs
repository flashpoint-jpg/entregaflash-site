import { createClient } from "@supabase/supabase-js";

const required = [
  "OLD_SUPABASE_URL",
  "OLD_SUPABASE_SERVICE_ROLE_KEY",
  "NEW_SUPABASE_URL",
  "NEW_SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Segredo ausente: ${key}`);
}

const source = createClient(
  process.env.OLD_SUPABASE_URL,
  process.env.OLD_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const target = createClient(
  process.env.NEW_SUPABASE_URL,
  process.env.NEW_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const TABLES = [
  ["entrega_clientes", ["telefone"]],
  ["entrega_motoristas", ["id"]],
  ["entrega_pedidos", ["id"]],
  ["entrega_saldos", ["telefone"]],
  ["entrega_clientes_saldos", ["telefone"]],
  ["entrega_clientes_movimentos_saldo", ["id"]],
  ["entrega_clientes_favoritos", ["id"]],
  ["entrega_clientes_motoristas_favoritos", ["cliente_telefone", "motorista_telefone"]],
  ["entrega_carteira_pix", ["id"]],
  ["entrega_saques", ["id"]],
  ["entrega_clientes_saques", ["id"]],
  ["entrega_chat", ["id"]],
  ["entrega_suporte", ["id"]],
  ["entrega_suporte_status", ["motorista_telefone"]],
  ["entrega_feedbacks", ["id"]],
  ["entrega_cancelamentos_motorista", ["id"]],
  ["entrega_chamados_amigo", ["id"]],
  ["entrega_testes_gps", ["id"]],
  ["entrega_testes_gps_respostas", ["id"]],
  ["entrega_pedido_chamadas", ["pedido_id", "motorista_telefone"]],
  ["entrega_indicacoes_motoristas", ["id"]],
  ["entrega_lideres_cidade", ["id"]],
  ["entrega_lider_indicacoes", ["id"]],
  ["entrega_funcionarios", ["id"]],
  ["entrega_admin_credenciais", ["id"]],
  ["entrega_alertas_admin", ["id"]],
  ["entrega_avisos_gerais", ["id"]],
  ["entrega_cliente_sessoes", ["token"]],
  ["entrega_parceiros", ["id"]],
  ["entrega_app_dispositivos", ["id"]],
  ["entrega_lembretes_documentos", ["motorista_telefone", "data_lembrete"]],
  ["entrega_push_eventos", ["id"]],
  ["entrega_reset_senha", ["id"]],
  ["entrega_rastreios_compartilhados", ["token_hash"]],
  ["push_subscriptions", ["id"]],
  ["entrega_funil_anuncio", ["id"]],
];

const PAGE = 250;

async function exactCount(db, table) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: falha ao contar: ${error.message}`);
  return Number(count || 0);
}

async function readPage(table, pk, from) {
  let q = source.from(table).select("*").range(from, from + PAGE - 1);
  for (const col of pk) q = q.order(col, { ascending: true });
  const { data, error } = await q;
  if (error) throw new Error(`${table}: falha ao ler origem: ${error.message}`);
  return data || [];
}

async function syncTable(table, pk) {
  let offset = 0;
  let copied = 0;

  for (;;) {
    const rows = await readPage(table, pk, offset);
    if (!rows.length) break;

    const { error } = await target
      .from(table)
      .upsert(rows, {
        onConflict: pk.join(","),
        ignoreDuplicates: false,
      });

    if (error) {
      throw new Error(`${table}: falha ao gravar destino: ${error.message}`);
    }

    copied += rows.length;
    offset += rows.length;
    if (rows.length < PAGE) break;
  }

  console.log(`OK ${table}: ${copied} linhas processadas`);
}

async function syncAll(tables = TABLES) {
  for (const [table, pk] of tables) await syncTable(table, pk);
}

async function compareCounts() {
  const mismatches = [];

  for (const [table, pk] of TABLES) {
    const [oldCount, newCount] = await Promise.all([
      exactCount(source, table),
      exactCount(target, table),
    ]);

    console.log(`CONTAGEM ${table}: origem=${oldCount} destino=${newCount}`);
    if (oldCount !== newCount) mismatches.push([table, pk, oldCount, newCount]);
  }

  return mismatches;
}

let migrationMode = false;

try {
  const begin = await target.rpc("entrega_migration_begin");
  if (begin.error) throw new Error(`Não foi possível ativar modo migração: ${begin.error.message}`);
  migrationMode = true;

  console.log("Modo migração ativado. Pushes e regras operacionais ficam suspensos no destino.");

  console.log("PASSO 1/3 — cópia inicial");
  await syncAll();

  console.log("PASSO 2/3 — segunda sincronização para capturar alterações ocorridas durante a cópia");
  await syncAll();

  let mismatches = await compareCounts();

  if (mismatches.length) {
    console.log(`PASSO 3/3 — corrigindo ${mismatches.length} tabela(s) com diferença de contagem`);
    await syncAll(mismatches.map(([table, pk]) => [table, pk]));
    mismatches = await compareCounts();
  }

  if (mismatches.length) {
    const summary = mismatches
      .map(([table, , a, b]) => `${table}(${a}/${b})`)
      .join(", ");
    throw new Error(`Contagens ainda diferentes após nova sincronização: ${summary}`);
  }

  const done = await target.rpc("entrega_migration_finalize");
  if (done.error) throw new Error(`Falha ao finalizar migração: ${done.error.message}`);
  migrationMode = false;

  console.log("Dados do Entrega Flash sincronizados e sequências ajustadas.");
} catch (error) {
  if (migrationMode) {
    const abort = await target.rpc("entrega_migration_abort");
    if (abort.error) console.error("ATENÇÃO: não foi possível sair do modo migração:", abort.error.message);
  }
  throw error;
}

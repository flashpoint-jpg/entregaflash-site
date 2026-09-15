import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,authorization,apikey,x-client-info", "Access-Control-Allow-Methods": "POST,OPTIONS" };
const companyFields = "id,estabelecimento,responsavel,whatsapp,cidade,endereco,tipo_negocio,entregas_dia,mensagem,status,criado_em,atualizado_em,cliente_telefone";
const orderFields = "id,cliente_nome,cliente_telefone,origem,destino,veiculo,descricao,distancia,preco,status,criado_em,atualizado_em,motorista_nome,motorista_telefone,origem_lat,origem_lng,destino_lat,destino_lng,paradas,paradas_coords,tipo_retirada,horario_agendado,aceito_em,iniciado_em,cancelado_em,cancelado_por,parada_atual";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
class Failure extends Error { constructor(message: string, public status = 400) { super(message); } }
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
function phone(v: unknown) { let p = String(v ?? "").replace(/\D/g, ""); if (/^55\d{10,11}$/.test(p)) p = p.slice(2); return p; }
async function digest(v: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))), x => x.toString(16).padStart(2, "0")).join(""); }
function check(result: {error: unknown}) { if (result.error) throw new Failure("Não foi possível concluir agora. Tente novamente.", 503); }
async function customer(token: unknown) {
  if (!/^[0-9a-f-]{36}$/i.test(String(token ?? ""))) throw new Failure("Entre na sua conta para continuar.", 401);
  const r = await db.rpc("entrega_cliente_validar_sessao", { p_token: token });
  if (r.error || !r.data?.ok || !r.data.telefone) throw new Failure("Sua sessão expirou. Entre novamente.", 401);
  return r.data as { telefone: string; nome: string };
}
async function admin(password: unknown) {
  if (!password || String(password).length > 256) throw new Failure("Acesso restrito ao administrador.", 401);
  const r = await db.rpc("entrega_verificar_senha_admin", { p_senha: password });
  if (r.error || r.data !== true) throw new Failure("Acesso restrito ao administrador.", 401);
}
function companyForm(value: Record<string, unknown>) {
  const v = { estabelecimento: clean(value.estabelecimento, 160), responsavel: clean(value.responsavel, 120), whatsapp: phone(value.whatsapp), cidade: clean(value.cidade, 120), endereco: clean(value.endereco, 300), tipo_negocio: clean(value.tipoNegocio, 30), entregas_dia: clean(value.entregasDia, 10), mensagem: clean(value.mensagem, 1500) };
  if (v.estabelecimento.length < 2 || v.responsavel.length < 2 || v.cidade.length < 2 || !/^\d{10,11}$/.test(v.whatsapp)) throw new Failure("Confira nome da empresa, responsável, cidade e WhatsApp com DDD.");
  if (!["farmacia", "mercado", "restaurante", "loja", "petshop", "autopecas", "floricultura", "outro"].includes(v.tipo_negocio)) throw new Failure("Escolha o tipo de negócio.");
  if (!["0-5", "6-10", "11-20", "20+"].includes(v.entregas_dia)) throw new Failure("Escolha o volume de entregas.");
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 12000) throw new Failure("Solicitação muito grande.", 413);
    const body = JSON.parse(raw);
    const action = body.acao;
    if (action === "conexao") return json({ ok: true, em: new Date().toISOString() });
    if (action === "rastrear") {
      if (!/^[a-f0-9]{64}$/.test(body.chave || "")) throw new Failure("Link inválido ou expirado.", 404);
      const access = await db.from("entrega_rastreios_compartilhados").select("pedido_id,expira_em,revogado").eq("token_hash", await digest(body.chave)).maybeSingle();
      check(access);
      if (!access.data || access.data.revogado || Date.parse(access.data.expira_em) <= Date.now()) throw new Failure("Link inválido ou expirado.", 404);
      const r = await db.from("entrega_pedidos").select("id,status,destino,paradas,parada_atual,veiculo,motorista_nome,motorista_lat,motorista_lng,motorista_atualizado_em,destino_lat,destino_lng,atualizado_em,horario_agendado").eq("id", access.data.pedido_id).maybeSingle();
      check(r);
      if (!r.data) throw new Failure("Entrega não encontrada.", 404);
      const p = r.data;
      const active = ["indo_coletar", "coletado", "a_caminho"].includes(p.status);
      const updated = Number(p.motorista_atualizado_em || 0);
      const fresh = active && updated > 0 && Date.now() - updated < 180000;
      return json({ pedido: { id: p.id, status: p.status, destino: p.destino, paradas: p.paradas, paradaAtual: p.parada_atual, veiculo: p.veiculo, motorista: clean(p.motorista_nome, 120).split(" ")[0], atualizadoEm: p.atualizado_em, agendado: p.horario_agendado, localizacaoAtualizadaEm: active ? updated : null, lat: fresh ? p.motorista_lat : null, lng: fresh ? p.motorista_lng : null, destinoLat: p.destino_lat, destinoLng: p.destino_lng } });
    }
    if (["admin_listar", "admin_atualizar", "admin_fluxo"].includes(action)) {
      await admin(body.senha);
      if (action === "admin_listar") {
        const r = await db.from("entrega_parceiros").select(companyFields + ",observacao_admin").order("criado_em", { ascending: false }).limit(1000);
        check(r); return json({ empresas: r.data });
      }
      if (action === "admin_atualizar") {
        if (!["novo", "em_contato", "ativo", "sem_interesse"].includes(body.status)) throw new Failure("Situação inválida.");
        const r = await db.from("entrega_parceiros").update({ status: body.status, observacao_admin: clean(body.observacao, 1500), atualizado_em: new Date().toISOString() }).eq("id", body.id).select("id").maybeSingle();
        check(r); if (!r.data) throw new Failure("Empresa não encontrada.", 404); return json({ ok: true });
      }
      const orders = await db.from("entrega_pedidos").select(orderFields).order("criado_em", { ascending: false }).limit(200);
      check(orders);
      const ids = (orders.data || []).map(p => p.id);
      const events = ids.length ? await db.from("entrega_alertas_admin").select("tipo,pedido_id,criado_em,mensagem").in("pedido_id", ids).order("criado_em", { ascending: false }).limit(2000) : { data: [], error: null };
      check(events);
      return json({ pedidos: orders.data, eventos: events.data, limitado: (orders.data || []).length === 200 || (events.data || []).length === 2000 });
    }
    const user = await customer(body.sessao);
    if (action === "empresa") {
      const r = await db.from("entrega_parceiros").select(companyFields).eq("cliente_telefone", user.telefone).maybeSingle();
      check(r); return json({ empresa: r.data });
    }
    if (action === "salvar_empresa") {
      const form = companyForm(body.form || {});
      const existing = await db.from("entrega_parceiros").select("id").eq("cliente_telefone", user.telefone).maybeSingle();
      check(existing);
      let id = existing.data?.id;
      if (!id && /^[a-f0-9-]{36}$/i.test(body.cadastroId || "")) {
        const lead = await db.from("entrega_parceiros").select("id,whatsapp,cliente_telefone").eq("id", body.cadastroId).maybeSingle();
        check(lead);
        if (lead.data && !lead.data.cliente_telefone && phone(lead.data.whatsapp) === phone(user.telefone)) id = lead.data.id;
      }
      const payload = { ...form, cliente_telefone: user.telefone, atualizado_em: new Date().toISOString() };
      const r = id ? await db.from("entrega_parceiros").update(payload).eq("id", id).select(companyFields).single() : await db.from("entrega_parceiros").insert(payload).select(companyFields).single();
      if (r.error?.code === "23505") throw new Failure("Esta conta já tem uma empresa. Atualize a página e abra Minha empresa.", 409);
      check(r); return json({ empresa: r.data });
    }
    if (action === "pedidos_empresa") {
      const r = await db.from("entrega_pedidos").select(orderFields).eq("cliente_telefone", user.telefone).order("criado_em", { ascending: false }).limit(500);
      check(r); return json({ pedidos: r.data, limitado: (r.data || []).length === 500 });
    }
    if (action === "gerar_rastreio" || action === "revogar_rastreio") {
      const r = await db.from("entrega_pedidos").select("id,horario_agendado,status").eq("id", clean(body.pedidoId, 100)).eq("cliente_telefone", user.telefone).maybeSingle();
      check(r); if (!r.data) throw new Failure("Entrega não encontrada nesta conta.", 404);
      if (action === "revogar_rastreio") {
        const revoked = await db.from("entrega_rastreios_compartilhados").update({ revogado: true }).eq("pedido_id", r.data.id).eq("cliente_telefone", user.telefone);
        check(revoked); return json({ ok: true });
      }
      const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, "0")).join("");
      const expiry = Math.min(Math.max(Date.now(), Date.parse(r.data.horario_agendado || "") || 0) + 7 * 86400000, Date.now() + 30 * 86400000);
      const saved = await db.from("entrega_rastreios_compartilhados").insert({ token_hash: await digest(key), pedido_id: r.data.id, cliente_telefone: user.telefone, expira_em: new Date(expiry).toISOString() });
      check(saved); return json({ chave: key, expiraEm: expiry });
    }
    throw new Failure("Ação não encontrada.", 404);
  } catch (error) {
    if (error instanceof Failure) return json({ error: error.message }, error.status);
    return json({ error: "Não foi possível processar a solicitação." }, 500);
  }
});

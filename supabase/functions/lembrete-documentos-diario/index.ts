import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.57.2'

const cors = { 'Content-Type': 'application/json' }

Deno.serve(async (req) => {
  const tokenEsperado = Deno.env.get('CRON_SECRET') || '__CRON_TOKEN__'
  if (!tokenEsperado || tokenEsperado.startsWith('__CRON_') || req.headers.get('x-cron-secret') !== tokenEsperado) {
    return new Response(JSON.stringify({ error: 'nao_autorizado' }), { status: 401, headers: cors })
  }
  const entrada = await req.json().catch(() => ({})) as { dry_run?: boolean }
  const dryRun = entrada.dry_run === true
  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

  const { data: motoristas, error } = await sb
    .from('entrega_motoristas')
    .select('telefone,nome,status,veiculo_tipo,foto_motorista_url,foto_veiculo_url,foto_veiculo_tras_url,cnh_url,crlv_url,chave_pix')
    .in('status', ['basico', 'liberado'])
    .limit(500)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors })

  let enviados = 0
  let elegiveis = 0
  for (const m of motoristas || []) {
    const telefone = String(m.telefone || '').replace(/\D/g, '')
    const pendente = !m.chave_pix || !m.foto_motorista_url || !m.foto_veiculo_url || !m.foto_veiculo_tras_url || !m.cnh_url || (m.veiculo_tipo !== 'bicicleta' && !m.crlv_url)
    if (!telefone || !pendente) continue
    elegiveis++
    if (dryRun) continue

    const { error: reservaErro } = await sb.from('entrega_lembretes_documentos').insert({ motorista_telefone: telefone, data_lembrete: hoje })
    if (reservaErro?.code === '23505') continue
    if (reservaErro) continue

    const primeiro = String(m.nome || '').trim().split(' ')[0]
    const resposta = await fetch(`${url}/functions/v1/enviar-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: JSON.stringify({
        papel: 'motorista', referencia: telefone,
        title: '📄 Falta concluir seu cadastro',
        body: `${primeiro ? primeiro + ', e' : 'E'}nvie os documentos pendentes para começar a receber corridas.`,
        url: '/?ir=login-motorista'
      })
    })
    if (resposta.ok) enviados++
    else await sb.from('entrega_lembretes_documentos').update({ status: 'erro' }).eq('motorista_telefone', telefone).eq('data_lembrete', hoje)
  }

  return new Response(JSON.stringify({ ok: true, dry_run: dryRun, data: hoje, elegiveis, enviados }), { headers: cors })
})

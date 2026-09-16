// Entrega Flash Admin — verificação dos canais de chamada dos motoristas online
(() => {
  const ID = 'ef-btn-teste-motoristas-online';
  const STATUS_ID = 'ef-status-teste-motoristas-online';
  let executando = false;
  let ultimoEventos = [];

  function refTel(v) { return String(v || '').replace(/\D/g, ''); }

  function appInfo(tel) {
    try {
      const ref = refTel(tel);
      return (estado.admin?.appDispositivos || []).find(a => refTel(a.referencia) === ref) || null;
    } catch (_) { return null; }
  }

  function appNativo(tel) {
    const app = appInfo(tel);
    return !!(app && app.notificacoes === 'nativo');
  }

  function appPushAtivo(tel) {
    const app = appInfo(tel);
    return !!(app && app.notificacoes === 'granted' && app.push_ativo);
  }

  function operacionalmenteOnline(m) {
    try {
      if (typeof motoristaOnlineAgora === 'function') return !!motoristaOnlineAgora(m);
      if (typeof motoristaPodeReceberPedido === 'function') return !!motoristaPodeReceberPedido(m);
      const gpsEm = Number(m?.lat_atualizado_em || 0);
      const temPosicao = m?.lat_atual != null && m?.lng_atual != null;
      return !!(m?.status === 'aprovado' && m?.disponivel && temPosicao && gpsEm > 0 && (Date.now() - gpsEm) <= 5 * 60 * 1000);
    } catch (_) { return false; }
  }

  function online() {
    try { return (estado.admin?.motoristas || []).filter(operacionalmenteOnline); }
    catch (_) { return []; }
  }

  function adminAberto() {
    try { return !!(estado.admin?.logado && estado.admin?.aberto); } catch (_) { return false; }
  }

  function statusEl() { return document.getElementById(STATUS_ID); }
  function setStatus(html, cor = '#fff') {
    const el = statusEl();
    if (!el) return;
    el.style.display = 'block';
    el.style.color = cor;
    el.innerHTML = html;
  }

  async function atualizarAberturas() {
    if (!ultimoEventos.length) return;
    try {
      const senha = estado.admin?.senhaDigitada || sessionStorage.getItem('ef_admin_senha') || '';
      if (!senha || typeof sb === 'undefined') return;
      const { data, error } = await sb.rpc('entrega_admin_push_status', { p_senha: senha, p_referencia: null });
      if (error) return;
      const ids = new Set(ultimoEventos.map(x => String(x.event_id || '')));
      const meus = (data || []).filter(e => ids.has(String(e.id || '')));
      const enviados = meus.filter(e => Number(e.enviados || 0) > 0).length;
      const abertos = meus.filter(e => !!e.aberto_em).length;
      setStatus(`📨 PUSH web entregue: <b>${enviados}</b> &nbsp; · &nbsp; 📱 App aberto pelo teste: <b>${abertos}</b>`, '#d9f99d');
    } catch (_) {}
  }

  async function dispararTeste() {
    if (executando) return;

    const todos = online();
    if (!todos.length) {
      setStatus('⚠️ Nenhum motorista realmente online agora.', '#ffd166');
      return;
    }

    const nativos = todos.filter(m => appNativo(m.telefone));
    const webPush = todos.filter(m => !appNativo(m.telefone) && appPushAtivo(m.telefone));
    const semCanal = todos.filter(m => !appNativo(m.telefone) && !appPushAtivo(m.telefone));

    // O APK nativo NÃO usa Web Push. O próprio serviço Android consulta pedidos
    // em segundo plano. GPS/heartbeat recente confirma que esse serviço está vivo.
    if (!webPush.length) {
      let html = '';
      if (nativos.length) {
        html += `✅ <b>${nativos.length}</b> motorista(s) no APK nativo com serviço de chamada em segundo plano ativo.<br><span style="opacity:.86">O APK não usa assinatura PUSH web; as corridas são buscadas automaticamente pelo serviço nativo.</span>`;
      }
      if (semCanal.length) {
        html += `${html ? '<br><br>' : ''}⚠️ <b>${semCanal.length}</b> motorista(s) online pelo navegador/PWA ainda sem PUSH web ativo. Ao abrir o app, o sistema tenta reparar essa assinatura automaticamente.`;
      }
      setStatus(html || '✅ Canal de chamadas verificado.', semCanal.length ? '#ffd166' : '#d9f99d');
      return;
    }

    if (!confirm(`Há ${todos.length} motorista(s) online.\n\n${nativos.length} usam chamada nativa do APK.\n${webPush.length} usam PUSH web e receberão uma notificação de teste.\n\nContinuar?`)) return;

    executando = true;
    ultimoEventos = [];
    const btn = document.getElementById(ID);
    if (btn) { btn.disabled = true; btn.textContent = '🧪 VERIFICANDO...'; }
    setStatus(`Verificando canais de <b>${todos.length}</b> motorista(s)...`);

    let comEntrega = 0;
    let semAssinatura = 0;
    let totalDispositivos = 0;

    for (const m of webPush) {
      const ref = refTel(m.telefone);
      try {
        let r = null;
        if (typeof enviarPushServidor === 'function') {
          r = await enviarPushServidor(
            'motorista',
            ref,
            '🧪 TESTE — Entrega Flash',
            'Teste de notificação. Não é uma corrida real.',
            '/?ir=login-motorista',
            'teste_chamada'
          );
        }
        const n = Number(r?.enviados || 0);
        totalDispositivos += n;
        if (n > 0) comEntrega++; else semAssinatura++;
        if (r?.event_id) ultimoEventos.push({ telefone: ref, event_id: r.event_id });
      } catch (_) {
        semAssinatura++;
      }
      await new Promise(resolve => setTimeout(resolve, 120));
    }

    const partes = [];
    if (nativos.length) partes.push(`✅ <b>${nativos.length}</b> APK nativo: serviço de chamada em segundo plano ativo.`);
    if (comEntrega) partes.push(`✅ PUSH web: <b>${comEntrega}/${webPush.length}</b> motorista(s) receberam pelo servidor (${totalDispositivos} dispositivo(s)).`);
    if (semAssinatura || semCanal.length) partes.push(`⚠️ <b>${semAssinatura + semCanal.length}</b> navegador/PWA ainda precisa reparar o PUSH web.`);

    setStatus(partes.join('<br>'), (semAssinatura || semCanal.length) ? '#ffd166' : '#d9f99d');

    executando = false;
    if (btn) { btn.disabled = false; btn.textContent = '🧪 VERIFICAR CHAMADAS NOS ONLINE'; }
    setTimeout(atualizarAberturas, 7000);
    setTimeout(atualizarAberturas, 20000);
  }

  function instalarUI() {
    if (document.getElementById(ID)) return;
    const caixa = document.createElement('div');
    caixa.id = 'ef-caixa-teste-motoristas';
    caixa.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;width:min(360px,calc(100vw - 24px));font-family:inherit;display:none';
    caixa.innerHTML = `
      <button id="${ID}" type="button" style="width:100%;padding:13px 16px;border:1px solid rgba(255,151,16,.55);border-radius:14px;background:#ff9710;color:#111;font-weight:950;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer">🧪 VERIFICAR CHAMADAS NOS ONLINE</button>
      <div id="${STATUS_ID}" style="display:none;margin-top:7px;padding:10px 12px;border-radius:12px;background:rgba(10,11,13,.96);border:1px solid rgba(255,255,255,.16);font-size:12px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.35)"></div>`;
    document.body.appendChild(caixa);
    document.getElementById(ID)?.addEventListener('click', dispararTeste);

    setInterval(() => {
      caixa.style.display = adminAberto() ? 'block' : 'none';
      const btn = document.getElementById(ID);
      if (btn && !executando && adminAberto()) {
        btn.textContent = `🧪 VERIFICAR CHAMADAS NOS ONLINE (${online().length})`;
      }
    }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalarUI);
  else instalarUI();
})();

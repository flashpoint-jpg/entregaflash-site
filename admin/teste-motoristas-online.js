// Entrega Flash Admin — botão de chamada TESTE para motoristas aptos
(() => {
  const ID = 'ef-btn-teste-motoristas-online';
  const STATUS_ID = 'ef-status-teste-motoristas-online';
  let executando = false;
  let ultimoEventos = [];

  function refTel(v) { return String(v || '').replace(/\D/g, ''); }

  function appPushAtivo(tel) {
    try {
      const ref = refTel(tel);
      return (estado.admin?.appDispositivos || []).some(a =>
        refTel(a.referencia) === ref && a.notificacoes === 'granted' && !!a.push_ativo
      );
    } catch (_) { return false; }
  }

  function aptos() {
    try {
      return (estado.admin?.motoristas || []).filter(m =>
        m?.status === 'aprovado' && !!m?.disponivel && appPushAtivo(m.telefone)
      );
    } catch (_) { return []; }
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
      setStatus(`📨 Chamadas entregues: <b>${enviados}</b> &nbsp; · &nbsp; 📱 App aberto pelo teste: <b>${abertos}</b>`, '#d9f99d');
    } catch (_) {}
  }

  async function dispararTeste() {
    if (executando) return;
    const lista = aptos();
    if (!lista.length) {
      setStatus('⚠️ Nenhum motorista apto agora. Só entra: aprovado + online + PUSH ativo.', '#ffd166');
      return;
    }
    if (!confirm(`Enviar CHAMADA TESTE para ${lista.length} motorista(s) apto(s)?\n\nNão cria corrida e não mexe em saldo.`)) return;

    executando = true;
    ultimoEventos = [];
    const btn = document.getElementById(ID);
    if (btn) { btn.disabled = true; btn.textContent = '🧪 ENVIANDO TESTE...'; }
    setStatus(`Enviando teste para <b>${lista.length}</b> motorista(s)...`);

    let comEntrega = 0;
    let semAssinatura = 0;
    let totalDispositivos = 0;

    for (const m of lista) {
      const ref = refTel(m.telefone);
      try {
        let r = null;
        if (typeof enviarPushServidor === 'function') {
          r = await enviarPushServidor(
            'motorista',
            ref,
            '🧪 TESTE — Entrega Flash',
            'Esta é apenas uma chamada de teste. Toque para confirmar que recebeu. NÃO é uma corrida real.',
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

    if (comEntrega > 0) {
      setStatus(`✅ Teste concluído: <b>${comEntrega}/${lista.length}</b> motorista(s) receberam pelo servidor (${totalDispositivos} dispositivo(s)).${semAssinatura ? `<br>⚠️ ${semAssinatura} ainda estão sem assinatura PUSH real.` : ''}`, '#d9f99d');
    } else {
      setStatus(`⚠️ O painel encontrou ${lista.length} apto(s), mas nenhuma assinatura PUSH real foi encontrada. Peça para eles abrirem o app uma vez após esta atualização; o cadastro PUSH será reparado automaticamente.`, '#ffd166');
    }

    executando = false;
    if (btn) { btn.disabled = false; btn.textContent = '🧪 TESTAR MOTORISTAS ONLINE'; }
    setTimeout(atualizarAberturas, 7000);
    setTimeout(atualizarAberturas, 20000);
    setTimeout(atualizarAberturas, 60000);
  }

  function instalarUI() {
    if (document.getElementById(ID)) return;
    const caixa = document.createElement('div');
    caixa.id = 'ef-caixa-teste-motoristas';
    caixa.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;width:min(360px,calc(100vw - 24px));font-family:inherit;display:none';
    caixa.innerHTML = `
      <button id="${ID}" type="button" style="width:100%;padding:13px 16px;border:1px solid rgba(255,151,16,.55);border-radius:14px;background:#ff9710;color:#111;font-weight:950;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer">🧪 TESTAR MOTORISTAS ONLINE</button>
      <div id="${STATUS_ID}" style="display:none;margin-top:7px;padding:10px 12px;border-radius:12px;background:rgba(10,11,13,.96);border:1px solid rgba(255,255,255,.16);font-size:12px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.35)"></div>`;
    document.body.appendChild(caixa);
    document.getElementById(ID)?.addEventListener('click', dispararTeste);

    setInterval(() => {
      caixa.style.display = adminAberto() ? 'block' : 'none';
      const btn = document.getElementById(ID);
      if (btn && !executando && adminAberto()) {
        btn.textContent = `🧪 TESTAR MOTORISTAS ONLINE (${aptos().length})`;
      }
    }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalarUI);
  else instalarUI();
})();

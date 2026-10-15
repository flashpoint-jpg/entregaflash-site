(function () {
  'use strict';
  // Integração na aba Motoristas existente: usa a senha de sessão do painel.
  const novo = window.supabase && window.supabase.createClient('https://urtpjcndtcleeorpnpct.supabase.co', 'sb_publishable_bhe5zL6CgvGrXBXeckK-Fg_zupiWu7A', {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  let dados = null, consultando = false, gravando = false, erro = '', filtro = 'pendente';
  const escape = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const pronto = () => {
    try { return typeof estado !== 'undefined' && estado.admin?.logado && estado.admin?.papel === 'dono'; }
    catch (e) { return false; }
  };
  const senha = () => {
    try { return estado.admin?.senhaDigitada || sessionStorage.getItem('ef_admin_senha') || ''; }
    catch (e) { return ''; }
  };
  function link(url) {
    try {
      const u = new URL(String(url || ''));
      return u.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/.test(u.hostname) &&
        u.pathname.includes('/storage/v1/object/public/motorista-documentos/') ? u.href : '';
    } catch (e) { return ''; }
  }
  function campos(m) {
    const all = [
      ['foto_motorista_url', 'Selfie'], ['cnh_url', 'CNH'],
      ['crlv_url', 'CRLV'], ['foto_veiculo_url', 'Foto frente'],
      ['foto_veiculo_tras_url', 'Foto traseira']
    ];
    return m.veiculo_tipo === 'bicicleta' ? all.filter(x => !['cnh_url', 'crlv_url'].includes(x[0])) : all;
  }
  const completos = m => campos(m).every(x => !!link(m[x[0]])) &&
    (m.veiculo_tipo !== 'bicicleta' || m.aceita_responsabilidade_bike === true);
  const itens = () => Array.isArray(dados) ? dados : [];
  const total = status => itens().filter(m => status === 'basico'
    ? ['basico', 'liberado'].includes(m.status) : m.status === status).length;
  function render() {
    const slot = document.getElementById('ef-docs-integrados');
    if (slot) {
      let html = '<div class="admin-cartao" style="margin-bottom:16px;padding:14px;border:2px solid var(--azul)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
        '<div><b style="font-size:17px">Documentação dos motoristas</b>' +
        '<div style="font-size:12px;color:var(--poeira);margin-top:3px">Documentos do banco atual do Entrega Flash · Mesmo login do painel</div></div>' +
        '<button type="button" class="btn btn-secundario btn-pequeno" data-efdocs="refresh">Atualizar</button></div>';
      if (erro) html += '<p style="font-size:12px;color:#fb9e9e">Não foi possível consultar o banco atual: ' +
        escape(erro) + '. Nenhuma informação foi alterada.</p>';
      if (consultando) html += '<p class="subtitulo">Consultando documentação...</p>';
      if (dados) {
        html += '<p style="font-size:13px;font-weight:700;color:var(--osso);margin:10px 0">' +
          total('pendente') + ' aguardando aprovação · ' + total('basico') +
          ' com fotos parciais · ' + total('reprovado') + ' reprovado(s)</p>';
        html += '<div style="display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 14px">' +
          [['pendente','Aguardando'],['basico','Parciais'],['reprovado','Reprovados'],['todos','Todos']]
          .map(x => '<button type="button" class="btn btn-secundario btn-pequeno" data-efdocs="filter" data-filter="' +
            x[0] + '"' + (filtro === x[0] ? ' style="border-color:var(--mango)"' : '') + '>' +
            x[1] + (x[0] !== 'todos' ? ' (' + total(x[0]) + ')' : '') + '</button>').join('') + '</div>';
        const filtered = itens().map((m,i) => ({m,i})).filter(({m}) =>
          filtro === 'todos' || (filtro === 'basico' ? ['basico','liberado'].includes(m.status) : m.status === filtro));
        if (!filtered.length) html += '<div class="subtitulo">Nenhum cadastro nessa situação.</div>';
        for (const entry of filtered) {
          const m = entry.m, i = entry.i;
          html += '<details style="padding:12px;margin:9px 0;border:1px solid var(--linha);border-radius:12px">' +
            '<summary style="cursor:pointer"><b>' + escape(m.nome || 'Motorista') + '</b> ' +
            '<span class="selo">' + escape(m.status) + '</span>' +
            '<div style="font-size:12px;color:var(--poeira);margin-top:4px">' +
            escape(m.cidade || '') + ' · ' + escape(m.veiculo_tipo || '') + ' · ' +
            escape(m.telefone || '') + '</div></summary>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:12px">';
          for (const c of campos(m)) {
            const u = link(m[c[0]]);
            html += '<div style="padding:10px;border:1px solid var(--linha);border-radius:9px;font-size:12px"><b>' +
              escape(c[1]) + '</b><div style="margin-top:7px">' +
              (u ? '<a href="' + escape(u) + '" target="_blank" rel="noopener noreferrer" style="color:var(--azul)">Abrir documento</a>' :
                '<span style="color:var(--chama)">Não enviado</span>') + '</div></div>';
          }
          html += '</div>';
          if (m.veiculo_tipo === 'bicicleta') html += '<p class="subtitulo">Responsabilidade bicicleta: ' +
            (m.aceita_responsabilidade_bike ? 'confirmada' : 'não confirmada') + '</p>';
          if (m.motivo_reprovacao) html += '<p class="subtitulo">Motivo anterior: ' +
            escape(m.motivo_reprovacao) + '</p>';
          if (['pendente','reprovado'].includes(m.status)) {
            html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
              (completos(m) ? '<button type="button" class="btn btn-verde btn-pequeno" data-efdocs="approve" data-index="' + i +
                '">Aprovar</button>' : '<span class="subtitulo">Documentação incompleta</span>') +
              '<button type="button" class="btn btn-secundario btn-pequeno" data-efdocs="reject" data-index="' +
              i + '">Solicitar correção</button></div>';
          }
          html += '</details>';
        }
      }
      slot.innerHTML = html + '</div>';
    }
    const brief = document.getElementById('ef-docs-resumo');
    if (brief) brief.innerHTML =
      '<div class="admin-cartao" style="margin-bottom:14px;padding:14px;border:1.5px solid var(--azul)">' +
      '<b>Documentos aguardando análise</b><p style="font-size:13px;color:var(--poeira);margin:6px 0 10px">' +
      (erro ? 'Consulta indisponível' : dados ? total('pendente') + ' motorista(s) no banco atual' : 'Consultando banco atual...') +
      '</p><button type="button" class="btn btn-primario btn-pequeno" data-efdocs="go">Abrir na aba Motoristas</button></div>';
  }
  async function load(force=false) {
    if (!pronto() || consultando || gravando || !senha()) return;
    if (dados !== null && !force) return;
    if (!novo) { erro = 'Biblioteca Supabase indisponível'; render(); return; }
    consultando = true; erro = ''; render();
    try {
      const r = await novo.rpc('entrega_admin_listar_documentos_pendentes', {p_senha: senha()});
      if (r.error) throw r.error;
      if (!Array.isArray(r.data)) throw Error('Resposta inválida do banco atual');
      dados = r.data;
    } catch(e) { erro = String(e?.message || e); }
    finally { consultando = false; render(); }
  }
  async function review(i, action) {
    if (!pronto() || gravando) return;
    const m = itens()[i];
    if (!m || !['pendente', 'reprovado'].includes(m.status)) return;
    let status, reason = null;
    if (action === 'approve') {
      if (!completos(m)) { alert('Os documentos obrigatórios precisam estar completos.'); return; }
      if (!confirm('Aprovar o motorista ' + m.nome + '?')) return;
      status = 'aprovado';
    } else if (action === 'reject') {
      const given = prompt('Explique o que precisa ser corrigido:', m.motivo_reprovacao || '');
      if (given === null) return;
      reason = given.trim();
      if (reason.length < 5) { alert('Explique o motivo da correção.'); return; }
      if (!confirm('Solicitar correção para ' + m.nome + '?')) return;
      status = 'reprovado';
    } else return;
    gravando = true;
    try {
      const r = await novo.rpc('entrega_admin_status_motorista', {
        p_senha: senha(), p_id: m.id, p_status: status,
        p_motivo: reason, p_documentos_reprovados: status === 'reprovado' ? [] : null
      });
      if (r.error) throw r.error;
      if (r.data !== true) throw Error('Cadastro não foi alterado');
      dados = null;
      alert('Situação atualizada no banco atual do Entrega Flash.');
    } catch (e) {
      alert('Falha ao salvar: ' + String(e?.message || e));
    } finally {
      gravando = false;
      await load(true);
    }
  }
  function mount() {
    if (!pronto()) return;
    let tab;
    try { tab = estado.admin.aba; } catch (e) { return; }
    const area = document.querySelector('.admin-aba-corpo');
    if (!area) return;
    if (tab === 'motoristas' && !area.querySelector('#ef-docs-integrados')) {
      const block = document.createElement('div');
      block.id = 'ef-docs-integrados';
      area.prepend(block); render(); load();
    } else if (tab === 'resumo' && !area.querySelector('#ef-docs-resumo')) {
      const block = document.createElement('div');
      block.id = 'ef-docs-resumo';
      area.prepend(block); render(); load();
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-efdocs]');
    if (!b) return;
    if (b.dataset.efdocs === 'refresh') load(true);
    if (b.dataset.efdocs === 'filter') { filtro = b.dataset.filter; render(); }
    if (b.dataset.efdocs === 'go') { if (typeof mudarAbaAdmin === 'function') mudarAbaAdmin('motoristas'); }
    if (b.dataset.efdocs === 'approve' || b.dataset.efdocs === 'reject') review(Number(b.dataset.index),b.dataset.efdocs);
  });
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, {childList:true,subtree:true});
  mount();
})();
// Entrega Flash — despacho PUSH alinhado com a tela do motorista
// Regras:
// - somente motorista aprovado + online + mesmo tipo de veículo
// - Pro recebe na hora; Free respeita o atraso configurado
// - raio: 30 km imediato, 60 km após 2 min, 120 km após 5 min, 200 km após 10 min
// - respeita o raio de atendimento escolhido pelo motorista
(() => {
  const enviadosPorPedido = new Map();
  const timersPorPedido = new Set();

  function n(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  }

  function tsMs(v) {
    let x = Number(v);
    if (!Number.isFinite(x)) {
      const p = Date.parse(String(v || ''));
      x = Number.isFinite(p) ? p : Date.now();
    }
    if (x > 0 && x < 100000000000) x *= 1000;
    return x;
  }

  function idadeMs(pedido) {
    return Math.max(0, Date.now() - tsMs(pedido?.criadoEm ?? pedido?.criado_em ?? Date.now()));
  }

  function setEnviados(id) {
    const chave = String(id || '');
    if (!enviadosPorPedido.has(chave)) enviadosPorPedido.set(chave, new Set());
    return enviadosPorPedido.get(chave);
  }

  async function pedidoAindaBuscando(id) {
    try {
      const { data, error } = await sb
        .from('entrega_pedidos')
        .select('id,status,origem,destino,veiculo,preco,criado_em,origem_lat,origem_lng,prioridade')
        .eq('id', String(id))
        .maybeSingle();
      if (error || !data || data.status !== 'buscando') return null;
      return {
        ...data,
        criadoEm: data.criado_em,
        origemCoord: (data.origem_lat != null && data.origem_lng != null)
          ? { lat: Number(data.origem_lat), lon: Number(data.origem_lng) }
          : null
      };
    } catch (_) {
      return null;
    }
  }

  async function despacharNoRaio(pedido, raioAutoKm) {
    try {
      if (typeof sb === 'undefined' || typeof enviarPushServidor !== 'function') {
        return { erro: 'servico_indisponivel', enviados: 0 };
      }

      const veiculo = String(pedido?.veiculo || '').trim();
      if (!veiculo) return { erro: 'veiculo_ausente', enviados: 0 };

      const origem = pedido?.origemCoord;
      const origemLat = n(origem?.lat);
      const origemLon = n(origem?.lon ?? origem?.lng);
      const atrasoFreeMs = (typeof ATRASO_PRIORIDADE_PRO_MS !== 'undefined')
        ? Math.max(0, Number(ATRASO_PRIORIDADE_PRO_MS) || 0)
        : 15000;
      const idade = idadeMs(pedido);
      const prioridade = !!pedido?.prioridade;

      const { data, error } = await sb
        .from('entrega_motoristas')
        .select('telefone,veiculo_tipo,status,disponivel,lat_atual,lng_atual,raio_atendimento_km,plano')
        .eq('status', 'aprovado')
        .eq('disponivel', true)
        .eq('veiculo_tipo', veiculo);

      if (error) throw error;

      const jaEnviados = setEnviados(pedido?.id);
      let enviados = 0;
      let elegiveis = 0;

      for (const m of data || []) {
        const telefone = String(m?.telefone || '').replace(/\D/g, '');
        if (!telefone || jaEnviados.has(telefone)) continue;

        // Mantém a mesma vantagem do plano Pro mostrada na tela.
        const pro = String(m?.plano || '').toLowerCase() === 'pro';
        if (!prioridade && !pro && idade < atrasoFreeMs) continue;

        const mLat = n(m?.lat_atual);
        const mLon = n(m?.lng_atual);
        const raioMotorista = n(m?.raio_atendimento_km);
        const limite = raioMotorista && raioMotorista > 0
          ? Math.min(Number(raioAutoKm), raioMotorista)
          : Number(raioAutoKm);

        let distancia = null;
        if (
          origemLat !== null && origemLon !== null &&
          mLat !== null && mLon !== null &&
          typeof distanciaKm === 'function'
        ) {
          distancia = Number(distanciaKm(mLat, mLon, origemLat, origemLon));
        }

        // Igual à tela: sem distância calculável, não bloqueia o pedido.
        if (distancia !== null && Number.isFinite(distancia) && distancia > limite) continue;

        elegiveis++;

        const titulo = (distancia !== null && Number.isFinite(distancia))
          ? '🆕 Pedido perto de você!'
          : '🆕 Novo pedido disponível!';

        const r = await enviarPushServidor(
          'motorista',
          telefone,
          titulo,
          `${pedido?.origem || 'Origem'} → ${pedido?.destino || 'Destino'} · R$ ${Number(pedido?.preco || 0).toFixed(2)}`,
          `/?ir=login-motorista&pedido=${encodeURIComponent(pedido?.id || '')}`,
          'novo_pedido'
        );

        const qtd = Math.max(0, Number(r?.enviados || 0));
        if (qtd > 0) {
          jaEnviados.add(telefone);
          enviados += qtd;
        }
      }

      return {
        enviados,
        elegiveis,
        raio_km: Number(raioAutoKm),
        motoristas_online_compativeis: (data || []).length
      };
    } catch (e) {
      console.warn('Falha no despacho PUSH por raio:', e);
      return { erro: String(e), enviados: 0 };
    }
  }

  function agendarOndas(pedido) {
    const id = String(pedido?.id || '');
    if (!id || timersPorPedido.has(id)) return;
    timersPorPedido.add(id);

    const atrasoFreeMs = (typeof ATRASO_PRIORIDADE_PRO_MS !== 'undefined')
      ? Math.max(0, Number(ATRASO_PRIORIDADE_PRO_MS) || 0)
      : 15000;

    // Libera Free no mesmo raio inicial quando terminar a vantagem do Pro.
    if (!pedido?.prioridade && atrasoFreeMs > 0) {
      setTimeout(async () => {
        const atual = await pedidoAindaBuscando(id);
        if (atual) await despacharNoRaio(atual, 30);
      }, atrasoFreeMs + 300);
    }

    const ondas = [
      [2 * 60 * 1000, 60],
      [5 * 60 * 1000, 120],
      [10 * 60 * 1000, 200]
    ];

    for (const [espera, raio] of ondas) {
      setTimeout(async () => {
        const atual = await pedidoAindaBuscando(id);
        if (!atual) return;
        await despacharNoRaio(atual, raio);
      }, espera);
    }
  }

  async function despachoCorrigido(pedido) {
    // Primeiro raio da tela: 30 km.
    const r = await despacharNoRaio(pedido, 30);
    agendarOndas(pedido);
    return r;
  }

  window.enviarPushPedidoMotoristasProximos = despachoCorrigido;
})();

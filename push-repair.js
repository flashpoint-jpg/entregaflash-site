// Entrega Flash — reparo confiável do cadastro de Push
// Garante que a assinatura REAL do navegador/app seja salva no servidor.
(() => {
  const ENDPOINT = 'https://rgcclordmqjmwuzrrfbd.supabase.co/functions/v1/registrar-push-seguro';
  let executando = false;
  let ultimoAlvo = '';

  // HOTFIX 17/09/2026 — usa como fonte de verdade a versão exposta pelo APK
  // no user-agent oficial (EntregaFlashNative/<versionCode>). Isso evita que uma
  // versão antiga persistida no localStorage provoque atualização em loop.
  function sincronizarVersaoNativaPeloUA() {
    try {
      const ua = String(navigator.userAgent || '');
      const m = ua.match(/EntregaFlashNative\/(\d+)/i);
      if (!m) return 0;
      const codigo = Number(m[1] || 0) || 0;
      if (codigo <= 0) return 0;
      localStorage.setItem('ef_native_android_bg_v1', '1');
      localStorage.setItem('ef_native_app_version_v1', String(codigo));
      return codigo;
    } catch (_) {
      return 0;
    }
  }

  function corrigirLoopAtualizacaoNativa() {
    try {
      const ua = String(navigator.userAgent || '');
      const apkOficial = /EntregaFlashNative\//i.test(ua);
      if (!apkOficial) return false;

      // Primeiro corrige qualquer versão antiga que tenha ficado presa no navegador.
      const versaoUA = sincronizarVersaoNativaPeloUA();
      const marcadoNativo = typeof entregaFlashNativoAndroidAtivo === 'function'
        ? entregaFlashNativoAndroidAtivo()
        : true;
      if (!marcadoNativo) return false;
      if (typeof versaoCodigoApkNativo !== 'function') return false;

      const instalada = Number(versaoCodigoApkNativo() || 0) || 0;
      // Quando o UA trouxe uma versão real, a regra original pode comparar normalmente.
      if (versaoUA > 0 && instalada > 0) return true;

      // Fallback somente para APK oficial cujo versionCode não chegou por nenhum meio.
      const original = window.exigirAtualizacaoApkAntesDeFicarOnline;
      if (typeof original !== 'function' || original.__efAntiLoop) return false;

      const corrigida = async function(...args) {
        try {
          const uaAgora = String(navigator.userAgent || '');
          const versaoAgoraUA = sincronizarVersaoNativaPeloUA();
          const atual = Number(typeof versaoCodigoApkNativo === 'function' ? versaoCodigoApkNativo() : 0) || 0;

          // Se a versão real foi recuperada do UA/localStorage, volta à regra oficial.
          if (versaoAgoraUA > 0 || atual > 0) return await original.apply(this, args);

          const nativoAgora = /EntregaFlashNative\//i.test(uaAgora)
            && (typeof entregaFlashNativoAndroidAtivo !== 'function' || entregaFlashNativoAndroidAtivo());
          if (nativoAgora) {
            console.info('[Entrega Flash] APK oficial sem versionCode; fallback anti-loop aplicado.');
            return true;
          }
        } catch (_) {}
        return await original.apply(this, args);
      };
      corrigida.__efAntiLoop = true;
      window.exigirAtualizacaoApkAntesDeFicarOnline = corrigida;
      return true;
    } catch (_) {
      return false;
    }
  }

  function alvoAtual() {
    try {
      if (typeof estado === 'undefined') return null;
      if (estado.admin?.logado && estado.admin?.aberto) return { papel: 'admin', referencia: 'admin' };
      const telMotorista = String(estado.motorista?.telefone || '').replace(/\D/g, '');
      if (estado.modo === 'entregador' && telMotorista) return { papel: 'motorista', referencia: telMotorista };
      const telCliente = String(estado.cliente?.telefone || '').replace(/\D/g, '');
      if (estado.cliente?.logado && telCliente) return { papel: 'cliente', referencia: telCliente };
    } catch (_) {}
    return null;
  }

  async function garantirPush() {
    if (executando) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const alvo = alvoAtual();
    if (!alvo?.referencia) return;

    executando = true;
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      const vapidAtual = typeof window.obterVapidPublicKey === 'function'
        ? await window.obterVapidPublicKey()
        : (typeof VAPID_PUBLIC_KEY !== 'undefined' ? VAPID_PUBLIC_KEY : '');
      if (!vapidAtual || typeof urlBase64ToUint8Array !== 'function') return;
      try {
        if (typeof SUPABASE_URL !== 'undefined' && String(SUPABASE_URL).includes('urtpjcndtcleeorpnpct') && sub) {
          const marcador = localStorage.getItem('ef_vapid_publica_registrada') || '';
          if (marcador !== vapidAtual) {
            try { await sub.unsubscribe(); } catch (_) {}
            sub = null;
          }
        }
      } catch (_) {}
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidAtual)
        });
      }
      const j = sub?.toJSON?.();
      if (!j?.endpoint || !j?.keys?.p256dh || !j?.keys?.auth) return;

      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ papel: alvo.papel, referencia: alvo.referencia, subscription: j })
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new Error(out?.erro || 'falha_registro_push');

      ultimoAlvo = `${alvo.papel}:${alvo.referencia}`;
      try {
        if (typeof SUPABASE_URL !== 'undefined' && String(SUPABASE_URL).includes('urtpjcndtcleeorpnpct')) {
          localStorage.setItem('ef_vapid_publica_registrada', vapidAtual);
        }
      } catch (_) {}
      try {
        if (typeof registrarStatusAplicativo === 'function') {
          await registrarStatusAplicativo(alvo.papel, alvo.referencia, true);
        }
      } catch (_) {}
    } catch (e) {
      console.warn('Reparo de push não concluído:', e);
    } finally {
      executando = false;
    }
  }

  sincronizarVersaoNativaPeloUA();
  corrigirLoopAtualizacaoNativa();
  window.entregaFlashRepararPush = garantirPush;
  window.entregaFlashCorrigirLoopAtualizacao = corrigirLoopAtualizacaoNativa;
  window.entregaFlashSincronizarVersaoNativa = sincronizarVersaoNativaPeloUA;
  window.addEventListener('load', () => {
    sincronizarVersaoNativaPeloUA();
    corrigirLoopAtualizacaoNativa();
    setTimeout(garantirPush, 1200);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      sincronizarVersaoNativaPeloUA();
      corrigirLoopAtualizacaoNativa();
      setTimeout(garantirPush, 350);
    }
  });
  setTimeout(() => {
    sincronizarVersaoNativaPeloUA();
    corrigirLoopAtualizacaoNativa();
    garantirPush();
  }, 1200);
  setInterval(() => {
    sincronizarVersaoNativaPeloUA();
    corrigirLoopAtualizacaoNativa();
    const a = alvoAtual();
    const chave = a ? `${a.papel}:${a.referencia}` : '';
    if (chave && (chave !== ultimoAlvo || !document.hidden)) garantirPush();
  }, 30000);
})();
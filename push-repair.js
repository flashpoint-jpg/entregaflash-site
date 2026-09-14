// Entrega Flash — reparo confiável do cadastro de Push
// Garante que a assinatura REAL do navegador/app seja salva no servidor.
(() => {
  const ENDPOINT = 'https://rgcclordmqjmwuzrrfbd.supabase.co/functions/v1/registrar-push-seguro';
  let executando = false;
  let ultimoAlvo = '';

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
      if (!sub) {
        if (typeof VAPID_PUBLIC_KEY === 'undefined' || typeof urlBase64ToUint8Array !== 'function') return;
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
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

  window.entregaFlashRepararPush = garantirPush;
  window.addEventListener('load', () => setTimeout(garantirPush, 1200));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(garantirPush, 350);
  });
  setTimeout(garantirPush, 3500);
  setInterval(() => {
    const a = alvoAtual();
    const chave = a ? `${a.papel}:${a.referencia}` : '';
    if (chave && (chave !== ultimoAlvo || !document.hidden)) garantirPush();
  }, 30000);
})();

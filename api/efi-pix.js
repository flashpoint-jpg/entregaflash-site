const https = require('https');

const BASE_URL = 'https://pix.api.efipay.com.br';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try { return JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body)); }
  catch (_) { return {}; }
}

function config() {
  return {
    clientId: process.env.EFI_CLIENT_ID_PROD || '',
    clientSecret: process.env.EFI_CLIENT_SECRET_PROD || '',
    certBase64: process.env.EFI_CERT_P12_PROD_BASE64 || '',
    pixKey: process.env.EFI_PIX_KEY || ''
  };
}

function missingConfig(cfg) {
  const missing = [];
  if (!cfg.clientId) missing.push('EFI_CLIENT_ID_PROD');
  if (!cfg.clientSecret) missing.push('EFI_CLIENT_SECRET_PROD');
  if (!cfg.certBase64) missing.push('EFI_CERT_P12_PROD_BASE64');
  if (!cfg.pixKey) missing.push('EFI_PIX_KEY');
  return missing;
}

function requestEfi(cfg, method, path, body, token, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const pfx = Buffer.from(cfg.certBase64, 'base64');
    const data = body == null ? null : JSON.stringify(body);
    const headers = { Accept: 'application/json', 'Accept-Encoding': 'identity', ...extraHeaders };

    if (data != null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (token) headers.Authorization = 'Bearer ' + token;

    const req = https.request(BASE_URL + path, {
      method,
      headers,
      pfx,
      passphrase: '',
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    }, (r) => {
      let raw = '';
      r.setEncoding('utf8');
      r.on('data', chunk => raw += chunk);
      r.on('end', () => {
        let parsed = {};
        if (raw) {
          try { parsed = JSON.parse(raw); } catch (_) { parsed = { raw }; }
        }
        if (r.statusCode >= 200 && r.statusCode < 300) return resolve({ status: r.statusCode, data: parsed });
        const err = new Error('efi_request_failed');
        err.status = r.statusCode || 500;
        err.data = parsed;
        reject(err);
      });
    });

    req.on('error', reject);
    if (data != null) req.write(data);
    req.end();
  });
}

async function getToken(cfg) {
  const basic = Buffer.from(cfg.clientId + ':' + cfg.clientSecret).toString('base64');
  const r = await requestEfi(
    cfg,
    'POST',
    '/oauth/token',
    { grant_type: 'client_credentials' },
    null,
    { Authorization: 'Basic ' + basic }
  );
  if (!r.data || !r.data.access_token) throw new Error('efi_token_ausente');
  return r.data.access_token;
}

function cleanDescription(v) {
  return String(v || 'Pagamento Entrega Flash').trim().slice(0, 140) || 'Pagamento Entrega Flash';
}

async function createCharge(cfg, body) {
  const valorNum = Number(body.valor);
  if (!Number.isFinite(valorNum) || valorNum < 0.01 || valorNum > 5000) {
    const e = new Error('valor_invalido');
    e.status = 400;
    throw e;
  }

  const expiracao = Math.max(60, Math.min(86400, Number(body.expiracao_seconds || 1800)));
  const payload = {
    calendario: { expiracao },
    valor: { original: valorNum.toFixed(2) },
    chave: cfg.pixKey,
    solicitacaoPagador: cleanDescription(body.descricao)
  };

  const token = await getToken(cfg);
  const cob = (await requestEfi(cfg, 'POST', '/v2/cob', payload, token)).data;

  let qr = null;
  if (cob && cob.loc && cob.loc.id) {
    qr = (await requestEfi(cfg, 'GET', '/v2/loc/' + encodeURIComponent(cob.loc.id) + '/qrcode', null, token)).data;
  }

  return {
    ambiente: 'producao',
    txid: cob.txid,
    cobranca_id: cob.txid,
    status: cob.status,
    valor: Number(cob?.valor?.original || valorNum),
    copia_cola: qr?.qrcode || cob.pixCopiaECola || '',
    qr_code_data_uri: qr?.imagemQrcode || '',
    loc_id: cob?.loc?.id || null
  };
}

async function getStatus(cfg, txid) {
  const id = String(txid || '').trim();
  if (!/^[A-Za-z0-9]{26,80}$/.test(id)) {
    const e = new Error('txid_invalido');
    e.status = 400;
    throw e;
  }

  const token = await getToken(cfg);
  const cob = (await requestEfi(cfg, 'GET', '/v2/cob/' + encodeURIComponent(id), null, token)).data;

  return {
    ambiente: 'producao',
    txid: cob.txid,
    status: cob.status,
    pago: cob.status === 'CONCLUIDA',
    valor: Number(cob?.valor?.original || 0),
    pix: Array.isArray(cob.pix) ? cob.pix : []
  };
}

module.exports = async function handler(req, res) {
  const cfg = config();
  const missing = missingConfig(cfg);
  const action = String((req.query && req.query.action) || '').toLowerCase();

  if (req.method === 'GET' && action === 'health') {
    return send(res, 200, { ok: missing.length === 0, ambiente: 'producao', missing });
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'metodo_nao_permitido' });
  if (missing.length) return send(res, 503, { error: 'efi_nao_configurada', missing });

  const body = parseBody(req);

  try {
    if (action === 'create') return send(res, 200, await createCharge(cfg, body));
    if (action === 'status') return send(res, 200, await getStatus(cfg, body.txid || body.cobranca_id));
    return send(res, 400, { error: 'acao_invalida' });
  } catch (e) {
    return send(res, e.status || 500, {
      error: e.message || 'efi_falhou',
      provider: e.data || undefined
    });
  }
};

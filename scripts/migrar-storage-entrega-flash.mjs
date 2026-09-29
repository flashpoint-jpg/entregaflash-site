import { createClient } from "@supabase/supabase-js";

const required = [
  "OLD_SUPABASE_URL",
  "OLD_SUPABASE_SERVICE_ROLE_KEY",
  "NEW_SUPABASE_URL",
  "NEW_SUPABASE_SERVICE_ROLE_KEY",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Segredo ausente: ${key}`);
  }
}

const oldDb = createClient(
  process.env.OLD_SUPABASE_URL,
  process.env.OLD_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const newDb = createClient(
  process.env.NEW_SUPABASE_URL,
  process.env.NEW_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const BUCKETS = ["entrega-fotos", "motorista-documentos"];

async function ensureBucket(bucket) {
  const current = await newDb.storage.getBucket(bucket);
  if (!current.error) return;

  const created = await newDb.storage.createBucket(bucket, { public: true });
  if (created.error && !String(created.error.message || "").toLowerCase().includes("already")) {
    throw created.error;
  }
}

async function listFolder(bucket, prefix = "") {
  const all = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await oldDb.storage
      .from(bucket)
      .list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) throw error;
    const rows = data || [];
    all.push(...rows);

    if (rows.length < 1000) break;
    offset += rows.length;
  }

  return all;
}

async function copyFolder(bucket, prefix = "") {
  const rows = await listFolder(bucket, prefix);

  for (const item of rows) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    const isFolder = !item.id && !item.metadata;

    if (isFolder) {
      await copyFolder(bucket, path);
      continue;
    }

    const downloaded = await oldDb.storage.from(bucket).download(path);
    if (downloaded.error) {
      throw new Error(`Falha ao baixar ${bucket}/${path}: ${downloaded.error.message}`);
    }

    const bytes = Buffer.from(await downloaded.data.arrayBuffer());
    const contentType =
      item.metadata?.mimetype ||
      item.metadata?.contentType ||
      "application/octet-stream";

    const uploaded = await newDb.storage.from(bucket).upload(path, bytes, {
      upsert: true,
      contentType,
      cacheControl: String(item.metadata?.cacheControl || "3600"),
    });

    if (uploaded.error) {
      throw new Error(`Falha ao enviar ${bucket}/${path}: ${uploaded.error.message}`);
    }

    console.log(`OK ${bucket}/${path} (${bytes.length} bytes)`);
  }
}

for (const bucket of BUCKETS) {
  console.log(`Copiando bucket: ${bucket}`);
  await ensureBucket(bucket);
  await copyFolder(bucket);
}

console.log("Storage do Entrega Flash copiado.");

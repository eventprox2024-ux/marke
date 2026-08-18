// Worker: sube archivos a R2 y devuelve la URL pública.
// Requiere el binding "BUCKET" (R2 Bucket) configurado en Settings > Bindings.
// Requiere el secret "UPLOAD_SECRET" configurado en Settings > Variables and Secrets
// (una clave inventada por ti, ej: "liconsumar-2026-xyz", solo para que no cualquiera
// pueda subir archivos a tu bucket llamando directamente al Worker).

const PUBLIC_URL_BASE = "https://pub-6da72a29639046caa287d94a460a2e51.r2.dev";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-upload-key",
};

export default {
  async fetch(request, env) {
    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Método no permitido" }), {
        status: 405,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Protección simple: solo tu app (que conoce la clave) puede subir archivos.
    const clave = request.headers.get("x-upload-key");
    if (!env.UPLOAD_SECRET || clave !== env.UPLOAD_SECRET) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    try {
      const formData = await request.formData();
      const file = formData.get("file");
      const carpeta = (formData.get("carpeta") || "general").toString().replace(/[^a-zA-Z0-9_-]/g, "");

      if (!file || typeof file === "string") {
        return new Response(JSON.stringify({ error: "No se recibió ningún archivo" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      // Límite de tamaño: 8 MB
      if (file.size > 8 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: "El archivo supera los 8 MB" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const key = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      await env.BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
      });

      const url = `${PUBLIC_URL_BASE}/${key}`;

      return new Response(JSON.stringify({ ok: true, url, key }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Error al subir el archivo", detalle: String(err) }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
  },
};

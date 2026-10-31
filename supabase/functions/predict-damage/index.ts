const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CLASSES = ["no-damage", "minor-damage", "major-damage", "destroyed"] as const;

interface ModelWeights {
  conv1W: Float32Array;
  conv1B: Float32Array;
  conv2W: Float32Array;
  conv2B: Float32Array;
  conv3W: Float32Array;
  conv3B: Float32Array;
  fc1W: Float32Array;
  fc1B: Float32Array;
  fc2W: Float32Array;
  fc2B: Float32Array;
}

let cachedModels: {
  balanced: ModelWeights;
  baseline: ModelWeights;
} | null = null;

function sliceWeights(buf: ArrayBuffer): ModelWeights {
  const f = new Float32Array(buf);
  if (f.length !== 25796) {
    throw new Error(`Invalid weight buffer length: ${f.length} (expected 25796)`);
  }
  return {
    conv1W: f.subarray(0, 432),
    conv1B: f.subarray(432, 448),
    conv2W: f.subarray(448, 5056),
    conv2B: f.subarray(5056, 5088),
    conv3W: f.subarray(5088, 23520),
    conv3B: f.subarray(23520, 23584),
    fc1W: f.subarray(23584, 25632),
    fc1B: f.subarray(25632, 25664),
    fc2W: f.subarray(25664, 25792),
    fc2B: f.subarray(25792, 25796),
  };
}

async function ensureWeights(supabaseUrl: string) {
  if (cachedModels) return cachedModels;
  const base = `${supabaseUrl}/storage/v1/object/public/geovision-artifacts`;
  const [balRes, baseRes] = await Promise.all([
    fetch(`${base}/weights_balanced.f32`),
    fetch(`${base}/weights_baseline.f32`),
  ]);
  if (!balRes.ok || !baseRes.ok) {
    throw new Error(`Failed to load model weights (${balRes.status}, ${baseRes.status})`);
  }
  const [balBuf, baseBuf] = await Promise.all([balRes.arrayBuffer(), baseRes.arrayBuffer()]);
  cachedModels = {
    balanced: sliceWeights(balBuf),
    baseline: sliceWeights(baseBuf),
  };
  return cachedModels;
}

function conv3x3ReluMaxPool2(
  input: Float32Array,
  cIn: number,
  h: number,
  w: number,
  weights: Float32Array,
  bias: Float32Array,
  cOut: number,
): Float32Array {
  const outH = h >> 1;
  const outW = w >> 1;
  const out = new Float32Array(cOut * outH * outW);
  const planeSize = h * w;

  for (let oc = 0; oc < cOut; oc++) {
    const bVal = bias[oc];
    const wOcOffset = oc * cIn * 9;
    const outOcOffset = oc * outH * outW;

    for (let py = 0; py < outH; py++) {
      const y0 = py * 2;
      for (let px = 0; px < outW; px++) {
        const x0 = px * 2;
        let maxVal = 0.0;

        for (let dy = 0; dy < 2; dy++) {
          const y = y0 + dy;
          for (let dx = 0; dx < 2; dx++) {
            const x = x0 + dx;
            let sum = bVal;

            for (let ic = 0; ic < cIn; ic++) {
              const inPlaneOffset = ic * planeSize;
              const wIcOffset = wOcOffset + ic * 9;

              for (let ky = 0; ky < 3; ky++) {
                const iy = y + ky - 1;
                if (iy < 0 || iy >= h) continue;
                const inRowOffset = inPlaneOffset + iy * w;
                const wRowOffset = wIcOffset + ky * 3;

                for (let kx = 0; kx < 3; kx++) {
                  const ix = x + kx - 1;
                  if (ix < 0 || ix >= w) continue;
                  sum += weights[wRowOffset + kx] * input[inRowOffset + ix];
                }
              }
            }

            if (sum > maxVal) maxVal = sum;
          }
        }

        out[outOcOffset + py * outW + px] = maxVal;
      }
    }
  }
  return out;
}

function runDamageCNN(chwInput: Float32Array, m: ModelWeights) {
  const x1 = conv3x3ReluMaxPool2(chwInput, 3, 128, 128, m.conv1W, m.conv1B, 16);
  const x2 = conv3x3ReluMaxPool2(x1, 16, 64, 64, m.conv2W, m.conv2B, 32);
  const x3 = conv3x3ReluMaxPool2(x2, 32, 32, 32, m.conv3W, m.conv3B, 64);

  const emb = new Float32Array(64);
  for (let c = 0; c < 64; c++) {
    let s = 0.0;
    const off = c * 256;
    for (let i = 0; i < 256; i++) s += x3[off + i];
    emb[c] = s / 256.0;
  }

  const hidden = new Float32Array(32);
  for (let o = 0; o < 32; o++) {
    let s = m.fc1B[o];
    const wOff = o * 64;
    for (let i = 0; i < 64; i++) s += m.fc1W[wOff + i] * emb[i];
    hidden[o] = s > 0 ? s : 0;
  }

  const logits = new Float32Array(4);
  let maxLogit = -Infinity;
  for (let o = 0; o < 4; o++) {
    let s = m.fc2B[o];
    const wOff = o * 32;
    for (let i = 0; i < 32; i++) s += m.fc2W[wOff + i] * hidden[i];
    logits[o] = s;
    if (s > maxLogit) maxLogit = s;
  }

  const probs = new Float32Array(4);
  let expSum = 0.0;
  for (let o = 0; o < 4; o++) {
    const e = Math.exp(logits[o] - maxLogit);
    probs[o] = e;
    expSum += e;
  }
  let bestIdx = 0;
  for (let o = 0; o < 4; o++) {
    probs[o] /= expSum;
    if (probs[o] > probs[bestIdx]) bestIdx = o;
  }

  const probMap: Record<string, number> = {};
  const logitMap: Record<string, number> = {};
  for (let o = 0; o < 4; o++) {
    probMap[CLASSES[o]] = Number(probs[o].toFixed(6));
    logitMap[CLASSES[o]] = Number(logits[o].toFixed(6));
  }

  return {
    predicted_label: CLASSES[bestIdx],
    confidence: Number(probs[bestIdx].toFixed(6)),
    probabilities: probMap,
    logits: logitMap,
    embedding: Array.from(emb, (v) => Number(v.toFixed(4))),
  };
}

function decodeBase64Bytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "https://yyulucwyzlaczlchulbp.supabase.co";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    if (req.method === "GET") {
      await ensureWeights(supabaseUrl);
      return new Response(
        JSON.stringify({
          status: "online",
          service: "GeoVision DamageCNN Edge Inference",
          models: [
            { slug: "geovision_pilot_cnn_balanced", parameters: 25796, input: [3, 128, 128], recommended: true },
            { slug: "geovision_pilot_cnn", parameters: 25796, input: [3, 128, 128], recommended: false },
          ],
          classes: CLASSES,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      rgb_base64,
      rgba_base64,
      model = "geovision_pilot_cnn_balanced",
      sample_name = "Uploaded Satellite Crop",
      original_width = 128,
      original_height = 128,
      crop_png_base64,
      notes,
      save_history = true,
    } = body;

    const chw = new Float32Array(3 * 128 * 128);
    const plane = 128 * 128;

    if (rgb_base64) {
      const rgb = decodeBase64Bytes(rgb_base64);
      if (rgb.length !== plane * 3) {
        return new Response(
          JSON.stringify({ error: `rgb_base64 decoded to ${rgb.length} bytes; expected ${plane * 3}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      for (let i = 0; i < plane; i++) {
        chw[i] = rgb[i * 3] / 255.0;
        chw[plane + i] = rgb[i * 3 + 1] / 255.0;
        chw[2 * plane + i] = rgb[i * 3 + 2] / 255.0;
      }
    } else if (rgba_base64) {
      const rgba = decodeBase64Bytes(rgba_base64);
      if (rgba.length !== plane * 4) {
        return new Response(
          JSON.stringify({ error: `rgba_base64 decoded to ${rgba.length} bytes; expected ${plane * 4}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      for (let i = 0; i < plane; i++) {
        chw[i] = rgba[i * 4] / 255.0;
        chw[plane + i] = rgba[i * 4 + 1] / 255.0;
        chw[2 * plane + i] = rgba[i * 4 + 2] / 255.0;
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Provide rgb_base64 (49152 bytes) or rgba_base64 (65536 bytes) for a 128x128 crop." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const t0 = performance.now();
    const weights = await ensureWeights(supabaseUrl);
    const balancedOut = runDamageCNN(chw, weights.balanced);
    const baselineOut = runDamageCNN(chw, weights.baseline);
    const inferenceMs = Number((performance.now() - t0).toFixed(2));

    const useBalanced = model !== "geovision_pilot_cnn";
    const primary = useBalanced ? balancedOut : baselineOut;
    const chosenSlug = useBalanced ? "geovision_pilot_cnn_balanced" : "geovision_pilot_cnn";

    let cropImageUrl: string | null = null;
    let savedRecord: Record<string, unknown> | null = null;

    if (save_history && serviceKey) {
      const id = crypto.randomUUID();

      if (crop_png_base64) {
        try {
          const pngBytes = decodeBase64Bytes(crop_png_base64);
          if (pngBytes.length <= 1_500_000) {
            const upRes = await fetch(`${supabaseUrl}/storage/v1/object/assessment-crops/${id}.png`, {
              method: "POST",
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                "Content-Type": "image/png",
                "x-upsert": "true",
              },
              body: pngBytes,
            });
            if (upRes.ok) {
              cropImageUrl = `${supabaseUrl}/storage/v1/object/public/assessment-crops/${id}.png`;
            }
          }
        } catch (_err) {
          // Non-fatal thumbnail storage failure
        }
      }

      const dbRes = await fetch(`${supabaseUrl}/rest/v1/damage_assessments`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          id,
          sample_name: String(sample_name).slice(0, 120),
          model_slug: chosenSlug,
          predicted_label: primary.predicted_label,
          confidence: primary.confidence,
          probabilities: primary.probabilities,
          baseline_prediction: {
            predicted_label: baselineOut.predicted_label,
            confidence: baselineOut.confidence,
            probabilities: baselineOut.probabilities,
          },
          original_width: Number(original_width) || 128,
          original_height: Number(original_height) || 128,
          crop_image_url: cropImageUrl,
          inference_ms: inferenceMs,
          notes: notes ? String(notes).slice(0, 300) : null,
        }),
      });

      if (dbRes.ok) {
        const rows = await dbRes.json();
        savedRecord = Array.isArray(rows) ? rows[0] : rows;
      }
    }

    return new Response(
      JSON.stringify({
        model_slug: chosenSlug,
        predicted_label: primary.predicted_label,
        confidence: primary.confidence,
        probabilities: primary.probabilities,
        logits: primary.logits,
        embedding: primary.embedding,
        comparison: {
          balanced: {
            predicted_label: balancedOut.predicted_label,
            confidence: balancedOut.confidence,
            probabilities: balancedOut.probabilities,
            logits: balancedOut.logits,
          },
          baseline: {
            predicted_label: baselineOut.predicted_label,
            confidence: baselineOut.confidence,
            probabilities: baselineOut.probabilities,
            logits: baselineOut.logits,
          },
        },
        inference_ms: inferenceMs,
        crop_image_url: cropImageUrl,
        assessment: savedRecord,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

/**
 * Extrai 5 frames-chave de cada reel da biblioteca e salva como base64
 * inline em library_reels.scene_frames.
 *
 * Frames mapeiam pra estrutura narrativa: hook → promessa → demonstração
 * → prova social → CTA. Usa os timestamps já gerados pelo Gemini em
 * library_reels.analysis_json.estrutura.
 *
 * Pipeline:
 *  1. Lê reels com analysis_json mas sem scene_frames
 *  2. Refaz Apify scrape (cache 24h economiza créditos) pra pegar videoUrl
 *  3. Baixa MP4 em /tmp
 *  4. Pra cada cena, ffmpeg -ss <timestamp> -frames:v 1 → JPG
 *  5. base64-encode e salva no JSONB
 *  6. Limpa /tmp
 *
 * Tamanho: 320×568 @ q4 ≈ 25KB/frame × 5 = ~125KB/reel
 *          28 reels × 125KB ≈ 3.5MB total no JSONB. OK.
 *
 * Custo: $0 ffmpeg local. Apify só re-executa se cache miss (24h).
 *
 * Usage:
 *   bun --env-file=.env.local scripts/extract-scene-frames.ts          # processa pendentes
 *   bun --env-file=.env.local scripts/extract-scene-frames.ts --force  # re-extrai todos
 *   bun --env-file=.env.local scripts/extract-scene-frames.ts <reel-id> # 1 só
 */

import { neon } from "@neondatabase/serverless";
import {
  fetchInstagramPost,
  fetchTikTokVideo,
  downloadReelVideo,
} from "../lib/apify";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL ausente");
  process.exit(1);
}
if (!process.env.APIFY_API_KEY) {
  console.error("✗ APIFY_API_KEY ausente");
  process.exit(1);
}
const sql = neon(url);

const args = process.argv.slice(2);
const force = args.includes("--force");
const idArg = args.find((a) => /^[0-9a-f-]{36}$/.test(a));

interface Estrutura {
  hook: { texto: string; tempo: string };
  promessa: { texto: string; tempo: string };
  demonstracao: { texto: string; tempo: string };
  provaSocial: { texto: string; tempo: string };
  cta: { texto: string; tempo: string };
}

interface AnalysisJson {
  estrutura?: Estrutura;
}

interface Row {
  id: string;
  ig_url: string;
  author_handle: string | null;
  duration_seconds: number | null;
  analysis_json: AnalysisJson | null;
}

interface SceneFrame {
  label: string;
  papel: keyof Estrutura;
  tempo: string;
  startSec: number;
  texto: string;
  dataUrl: string; // data:image/jpeg;base64,...
}

const SCENES: Array<{ label: string; key: keyof Estrutura }> = [
  { label: "Hook", key: "hook" },
  { label: "Promessa", key: "promessa" },
  { label: "Demonstração", key: "demonstracao" },
  { label: "Prova social", key: "provaSocial" },
  { label: "CTA", key: "cta" },
];

/** Extrai segundos de início de "00:03–00:08" ou "0:03". */
function parseTempo(tempo: string): number {
  const start = tempo.split(/[–-]/)[0].trim();
  const parts = start.split(":").map((s) => parseInt(s, 10));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number.isFinite(parts[0]) ? parts[0] : 0;
}

function ffmpegFrame(
  inputPath: string,
  outPath: string,
  startSec: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-ss",
      String(startSec),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=320:-2",
      "-q:v",
      "4",
      "-y",
      outPath,
    ]);
    let stderr = "";
    ff.stderr.on("data", (d) => (stderr += d.toString()));
    ff.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 200)}`));
    });
  });
}

async function processReel(row: Row): Promise<{ frames: number }> {
  if (!row.analysis_json?.estrutura) {
    throw new Error("sem estrutura na analysis_json");
  }
  const estrutura = row.analysis_json.estrutura;
  const duration = row.duration_seconds ?? 60;

  // 1. Scrape — escolhe IG ou TikTok pelo host
  const isTikTok = /tiktok\.com/i.test(row.ig_url);
  const item = isTikTok
    ? await fetchTikTokVideo(row.ig_url)
    : await fetchInstagramPost(row.ig_url);
  if (item.type !== "Video" || !item.videoUrl) {
    throw new Error(`não é video (type=${item.type})`);
  }

  // 2. Download MP4 em /tmp
  const videoBytes = await downloadReelVideo(item.videoUrl);
  const tmpVideo = join(tmpdir(), `rv-frame-${row.id}.mp4`);
  await writeFile(tmpVideo, Buffer.from(videoBytes));

  try {
    // 3. Extrai frame por cena
    const frames: SceneFrame[] = [];
    for (const scene of SCENES) {
      const block = estrutura[scene.key];
      if (!block?.tempo) continue;
      let startSec = parseTempo(block.tempo);
      // Clamp: ffmpeg precisa de startSec < duração; se passou, pula
      if (startSec >= duration) startSec = Math.max(0, duration - 1);
      // Nudge 0.3s pra dentro da cena (evita preto antes do corte)
      startSec = Math.max(0, startSec + 0.3);

      const outPath = join(tmpdir(), `rv-frame-${row.id}-${scene.key}.jpg`);
      try {
        await ffmpegFrame(tmpVideo, outPath, startSec);
        const bytes = await readFile(outPath);
        const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
        frames.push({
          label: scene.label,
          papel: scene.key,
          tempo: block.tempo,
          startSec,
          texto: block.texto,
          dataUrl,
        });
        await unlink(outPath).catch(() => {});
      } catch (err) {
        console.warn(`  scene ${scene.key} falhou:`, err instanceof Error ? err.message : err);
      }
    }

    if (frames.length === 0) throw new Error("zero frames extraídos");

    // 4. Salva no DB
    await sql`
      UPDATE library_reels
         SET scene_frames = ${JSON.stringify(frames)}::jsonb
       WHERE id = ${row.id}::uuid
    `;
    return { frames: frames.length };
  } finally {
    await unlink(tmpVideo).catch(() => {});
  }
}

async function main() {
  let queue: Row[];
  if (idArg) {
    queue = (await sql`
      SELECT id::text, ig_url, author_handle, duration_seconds, analysis_json
        FROM library_reels
       WHERE id = ${idArg}::uuid AND analysis_json IS NOT NULL
    `) as Row[];
  } else if (force) {
    queue = (await sql`
      SELECT id::text, ig_url, author_handle, duration_seconds, analysis_json
        FROM library_reels
       WHERE analysis_json IS NOT NULL
       ORDER BY featured DESC, scraped_at DESC NULLS LAST
    `) as Row[];
  } else {
    queue = (await sql`
      SELECT id::text, ig_url, author_handle, duration_seconds, analysis_json
        FROM library_reels
       WHERE analysis_json IS NOT NULL AND scene_frames IS NULL
       ORDER BY featured DESC, scraped_at DESC NULLS LAST
    `) as Row[];
  }

  console.log(`[frames] ${queue.length} reels pra processar (force=${force})`);
  if (queue.length === 0) {
    console.log("[frames] nada pendente.");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < queue.length; i++) {
    const row = queue[i];
    const tag = `[${i + 1}/${queue.length}] ${row.author_handle ?? "?"} ${row.id.slice(0, 8)}`;
    try {
      const t0 = Date.now();
      const { frames } = await processReel(row);
      const elapsed = Math.round((Date.now() - t0) / 100) / 10;
      console.log(`${tag} ✓ ${frames} frames · ${elapsed}s`);
      ok++;
    } catch (err) {
      console.error(`${tag} ✗`, err instanceof Error ? err.message : err);
      fail++;
    }
  }

  console.log(`\n[frames] terminou · ok=${ok} fail=${fail}`);

  const summary = (await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(scene_frames)::int AS with_frames
      FROM library_reels
  `) as Array<{ total: number; with_frames: number }>;
  console.log("[frames] summary:", JSON.stringify(summary[0]));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[frames] crashed:", err);
    process.exit(1);
  });

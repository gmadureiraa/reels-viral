/**
 * Adapter Apify para puxar metadata + videoUrl de um Reel/post Instagram.
 * Usa o actor `apify~instagram-scraper` (mesmo que SV usa).
 *
 * Padrão run-sync-get-dataset-items: chama o actor, espera o resultado,
 * recebe o array de items diretamente (sem precisar fazer polling).
 */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "apify~instagram-scraper";
const TIMEOUT_SECS = 60;

export interface ApifyReelItem {
  shortCode: string;
  url: string;
  type: "Video" | "Image" | "Sidecar";
  ownerUsername: string;
  ownerFullName?: string;
  caption?: string;
  hashtags?: string[];
  mentions?: string[];
  videoUrl?: string;
  videoDuration?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  timestamp?: string;
  productType?: string;
  displayUrl?: string;
}

export class ApifyError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
  }
}

export async function fetchInstagramPost(
  url: string
): Promise<ApifyReelItem> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) {
    throw new ApifyError("APIFY_API_KEY missing", false);
  }

  const endpoint = `${APIFY_BASE}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}&timeout=${TIMEOUT_SECS}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      directUrls: [url],
      resultsType: "details",
      resultsLimit: 1,
      addParentData: false,
    }),
    signal: AbortSignal.timeout((TIMEOUT_SECS + 10) * 1000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 403 platform-feature-disabled / hard limit = conta Apify estourou a
    // cota mensal. Não é culpa do user nem da URL — mensagem clara e
    // retryable=true (502) pra não parecer "URL inválida" (400).
    if (res.status === 403 && /hard limit|feature-disabled|usage/i.test(text)) {
      throw new ApifyError(
        "Estamos com a cota de scraping no limite por agora. Tenta de novo em alguns minutos — já estamos resolvendo.",
        true
      );
    }
    throw new ApifyError(
      `Apify ${res.status}: ${text.slice(0, 160)}`,
      res.status >= 500
    );
  }

  const items = (await res.json()) as ApifyReelItem[];
  if (!items || items.length === 0) {
    throw new ApifyError("Apify retornou 0 items", true);
  }

  const item = items[0];
  if (!item.shortCode) {
    throw new ApifyError("Item sem shortCode — URL inválida?", false);
  }

  return item;
}

/** Audit P1 (Antigravity): cap pra evitar OOM em Vercel Functions
 *  (Hobby tier tem 512MB RAM). Reel típico de IG é 8-15MB; 50MB cobre
 *  edge cases (long form, 1080p) sem expor a download de gigabytes. */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/**
 * Baixa o vídeo MP4 do Reel e retorna o ArrayBuffer.
 * IG CDN expira em ~24h, então sempre baixamos fresh.
 *
 * Rejeita vídeos > 50MB (via Content-Length header quando presente, ou
 * checagem após download). Sem essa proteção, um vídeo malicioso de
 * centenas de MB derrubaria a função serverless por OOM.
 *
 * Retry: 1 retry com backoff em 5xx/network error. IG CDN tem
 * intermitência ocasional (~2% req falham com 503/504 no primeiro try)
 * e o user paga 30s+ se falhar definitivo. 2 tentativas resolvem ~99%.
 */
export async function downloadReelVideo(
  videoUrl: string
): Promise<ArrayBuffer> {
  const MAX_ATTEMPTS = 2;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(videoUrl, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        // 4xx é erro permanente (URL expirou / inválida); 5xx é retryable
        const retryable = res.status >= 500;
        if (!retryable || attempt === MAX_ATTEMPTS) {
          throw new ApifyError(`Falha ao baixar vídeo: ${res.status}`, retryable);
        }
        lastErr = new Error(`HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }

      // Pré-check via Content-Length quando disponível (IG CDN sempre envia).
      const contentLength = res.headers.get("content-length");
      if (contentLength) {
        const bytes = Number(contentLength);
        if (Number.isFinite(bytes) && bytes > MAX_VIDEO_BYTES) {
          throw new ApifyError(
            `Vídeo grande demais (${(bytes / 1024 / 1024).toFixed(0)}MB > ${MAX_VIDEO_BYTES / 1024 / 1024}MB). Reels de até ${MAX_VIDEO_BYTES / 1024 / 1024}MB são suportados.`,
            false
          );
        }
      }

      const buffer = await res.arrayBuffer();

      // Defesa em profundidade: alguns CDNs omitem Content-Length em chunked
      // responses. Verificamos o tamanho real após download.
      if (buffer.byteLength > MAX_VIDEO_BYTES) {
        throw new ApifyError(
          `Vídeo baixado ultrapassou limite (${(buffer.byteLength / 1024 / 1024).toFixed(0)}MB).`,
          false
        );
      }

      return buffer;
    } catch (err) {
      // ApifyError com retryable=false → não retry (cap exceeded, 4xx)
      if (err instanceof ApifyError && !err.retryable) throw err;
      lastErr = err as Error;
      if (attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }

  throw new ApifyError(
    `Falha ao baixar vídeo após ${MAX_ATTEMPTS} tentativas: ${lastErr?.message ?? "desconhecido"}`,
    true,
  );
}

// ─── TikTok scraper ──────────────────────────────────────────────────────
//
// Usa actor `clockworks~tiktok-scraper`. Aceita URL direta de vídeo
// (`tiktok.com/@user/video/123...`). Retorna shape unificado pra o pipeline
// tratar TikTok igual a um Reel IG.

const TIKTOK_ACTOR_ID = "clockworks~tiktok-scraper";
// TikTok actor é mais lento que IG (~50-90s). Damos margem maior.
const TIKTOK_TIMEOUT_SECS = 120;

export interface ApifyTikTokItem {
  id?: string;
  webVideoUrl?: string;
  text?: string;
  authorMeta?: {
    name?: string;
    nickName?: string;
  };
  videoMeta?: {
    duration?: number;
    downloadAddr?: string;
    coverUrl?: string;
  };
  diggCount?: number;
  playCount?: number;
  shareCount?: number;
  commentCount?: number;
  createTimeISO?: string;
  videoUrl?: string;
  cover?: string;
}

/**
 * Shape unificado entre IG Reel e TikTok pra o pipeline downstream tratar
 * ambos com mesmo código (analyze, frames, etc). `source` distingue.
 */
export interface ApifyMediaItem extends ApifyReelItem {
  source: "instagram" | "tiktok";
}

/**
 * Search TikTok via tikwm.com (gratuito, instantâneo, ~1-2s). Retorna top 1
 * com videoUrl direto pra download — sem Apify, sem actor lento.
 */
export async function searchTikTokTopVideo(
  query: string,
): Promise<ApifyMediaItem> {
  const res = await fetch("https://www.tikwm.com/api/feed/search", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `keywords=${encodeURIComponent(query)}&count=1&hd=0`,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new ApifyError(`tikwm search ${res.status}`, res.status >= 500);
  }
  const json = (await res.json()) as {
    code: number;
    msg?: string;
    data?: {
      videos?: Array<{
        video_id?: string;
        title?: string;
        cover?: string;
        duration?: number;
        play?: string;
        wmplay?: string;
        author?: { unique_id?: string; nickname?: string };
        digg_count?: number;
        play_count?: number;
        comment_count?: number;
      }>;
    };
  };
  if (json.code !== 0 || !json.data?.videos || json.data.videos.length === 0) {
    throw new ApifyError(`Search '${query}' sem resultados`, true);
  }
  const v = json.data.videos[0];
  const abs = (path: string | undefined) => {
    if (!path) return undefined;
    if (path.startsWith("http")) return path;
    return `https://www.tikwm.com${path}`;
  };
  const owner = v.author?.unique_id ?? "unknown";
  const shortCode = v.video_id ?? "tiktok-search";
  return {
    source: "tiktok",
    shortCode,
    url: `https://www.tiktok.com/@${owner}/video/${shortCode}`,
    type: "Video",
    ownerUsername: owner,
    caption: v.title,
    videoUrl: abs(v.play) ?? abs(v.wmplay),
    videoDuration: v.duration,
    likesCount: v.digg_count,
    videoViewCount: v.play_count,
    videoPlayCount: v.play_count,
    commentsCount: v.comment_count,
    displayUrl: abs(v.cover),
  };
}

/**
 * Resolve URL TikTok → MP4 download URL via tikwm.com (API pública,
 * gratuita, instantânea). O actor clockworks~tiktok-scraper é confiável
 * pra metadata mas lento/sem download direto. Combinamos os dois:
 *  - tikwm: videoUrl pra download (~1s)
 *  - clockworks (opcional): metadata enriquecida quando precisa
 */
async function resolveTikTokDownloadUrl(
  url: string,
): Promise<{
  videoUrl: string;
  cover?: string;
  duration?: number;
  authorUsername?: string;
  caption?: string;
  likes?: number;
  views?: number;
  shortCode?: string;
}> {
  const res = await fetch("https://www.tikwm.com/api/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `url=${encodeURIComponent(url)}&hd=0`,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new ApifyError(`tikwm ${res.status}`, res.status >= 500);
  }
  const json = (await res.json()) as {
    code: number;
    msg?: string;
    data?: {
      id?: string;
      title?: string;
      cover?: string;
      duration?: number;
      play?: string; // sem watermark
      wmplay?: string; // com watermark
      author?: { unique_id?: string; nickname?: string };
      digg_count?: number;
      play_count?: number;
    };
  };
  if (json.code !== 0 || !json.data) {
    throw new ApifyError(`tikwm: ${json.msg ?? "no data"}`, true);
  }
  const d = json.data;
  const abs = (path: string | undefined) => {
    if (!path) return undefined;
    if (path.startsWith("http")) return path;
    return `https://www.tikwm.com${path}`;
  };
  return {
    videoUrl: abs(d.play) ?? abs(d.wmplay) ?? "",
    cover: abs(d.cover),
    duration: d.duration,
    authorUsername: d.author?.unique_id,
    caption: d.title,
    likes: d.digg_count,
    views: d.play_count,
    shortCode: d.id,
  };
}

export async function fetchTikTokVideo(url: string): Promise<ApifyMediaItem> {
  // Path rápido: tikwm resolve URL → MP4 + metadata em ~1s.
  // Sem dependência do actor lento.
  try {
    const r = await resolveTikTokDownloadUrl(url);
    if (!r.videoUrl) {
      throw new ApifyError("tikwm sem videoUrl", true);
    }
    return {
      source: "tiktok",
      shortCode: r.shortCode ?? url.match(/\/video\/(\d+)/)?.[1] ?? "tiktok-?",
      url,
      type: "Video",
      ownerUsername: r.authorUsername ?? "unknown",
      caption: r.caption,
      videoUrl: r.videoUrl,
      videoDuration: r.duration,
      likesCount: r.likes,
      videoViewCount: r.views,
      videoPlayCount: r.views,
      displayUrl: r.cover,
    };
  } catch (err) {
    // Fallback: tenta o actor Apify (mais lento mas mais robusto)
    console.warn(
      "[apify] tikwm falhou, fallback Apify actor:",
      err instanceof Error ? err.message : err,
    );
  }

  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new ApifyError("APIFY_API_KEY missing", false);

  const endpoint = `${APIFY_BASE}/acts/${TIKTOK_ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}&timeout=${TIKTOK_TIMEOUT_SECS}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postURLs: [url],
      resultsPerPage: 1,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      shouldDownloadSlideshowImages: false,
    }),
    signal: AbortSignal.timeout((TIKTOK_TIMEOUT_SECS + 15) * 1000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApifyError(
      `Apify TikTok ${res.status}: ${text.slice(0, 160)}`,
      res.status >= 500,
    );
  }

  const items = (await res.json()) as ApifyTikTokItem[];
  if (!items || items.length === 0) {
    throw new ApifyError("Apify TikTok retornou 0 items", true);
  }

  const item = items[0];
  const videoUrl = item.videoUrl ?? item.videoMeta?.downloadAddr;
  const owner = item.authorMeta?.name ?? item.authorMeta?.nickName ?? "unknown";
  const idMatch = (item.webVideoUrl ?? url).match(/\/video\/(\d+)/);
  const shortCode = idMatch?.[1] ?? item.id ?? "tiktok-unknown";

  return {
    source: "tiktok",
    shortCode,
    url: item.webVideoUrl ?? url,
    type: "Video",
    ownerUsername: owner,
    caption: item.text,
    videoUrl,
    videoDuration: item.videoMeta?.duration,
    videoViewCount: item.playCount,
    videoPlayCount: item.playCount,
    likesCount: item.diggCount,
    commentsCount: item.commentCount,
    timestamp: item.createTimeISO,
    displayUrl: item.cover ?? item.videoMeta?.coverUrl,
  };
}

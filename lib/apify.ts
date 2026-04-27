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

/**
 * Baixa o vídeo MP4 do Reel e retorna o ArrayBuffer.
 * IG CDN expira em ~24h, então sempre baixamos fresh.
 */
export async function downloadReelVideo(
  videoUrl: string
): Promise<ArrayBuffer> {
  const res = await fetch(videoUrl, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new ApifyError(`Falha ao baixar vídeo: ${res.status}`, true);
  }
  return await res.arrayBuffer();
}

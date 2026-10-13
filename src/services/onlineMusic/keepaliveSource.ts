import type { AudioQualityPreference, ProviderAudioSource } from '@/types/onlineMusic';
import type { SongResult } from '@/types';

// src/services/onlineMusic/keepaliveSource.ts
// Resolves playback URLs through a third-party source API (the GDStudio music API,
// standing in for Huibq/keep-alive whose Render service was suspended by its owner).
// GET {base}/api.php?types=url&source={slug}&id={songId}&br={bitrate} → {code, url, br}.
// Installed as an Omni audio hook: when the built-in provider answered first we hand
// that URL back untouched — the custom source is only consulted when it is enabled.
// Returns null (fall through to the provider result) on any failure: playback must
// never break because the third-party API is down or rate-limited.

const API_BASE = 'https://music-api.gdstudio.xyz';

/** GDStudio source slugs: only Netease accepts our song ids (joox exists but empty). */
const SOURCE_SLUG: Record<string, string> = {
    netease: 'netease',
};

export const KEEPALIVE_QUALITIES: Record<string, string> = {
    standard: '128',
    high: '320',
    lossless: '999',
    hires: '999',
};

const isHttpUrl = (url: string) => /^https?:\/\//.test(url);

export interface KeepaliveResolution {
    url: string;
    quality: string;
}

export const fetchKeepaliveUrl = async (
    slug: string,
    mediaId: string,
    quality: AudioQualityPreference,
): Promise<KeepaliveResolution | null> => {
    const mapped = KEEPALIVE_QUALITIES[quality] ?? '320';
    try {
        const response = await fetch(
            `${API_BASE}/api.php?types=url&source=${slug}&id=${encodeURIComponent(mediaId)}&br=${mapped}`,
        );
        if (!response.ok) return null;
        const body = await response.json() as { url?: unknown; br?: unknown };
        if (typeof body.url !== 'string' || !isHttpUrl(body.url)) return null;
        return { url: body.url, quality: String(body.br ?? mapped) };
    } catch {
        return null;
    }
};

/** The custom-source slug for a song, or null when its source is not one we can resolve. */
export const keepaliveSlugForSong = (song: SongResult): string | null => {
    if (song.sourceRef?.kind !== 'online') return null;
    const slug = SOURCE_SLUG[song.sourceRef.providerId];
    return slug ?? null;
};

export const resolveKeepaliveSource = async (
    song: SongResult,
    quality: AudioQualityPreference,
): Promise<ProviderAudioSource | null> => {
    const slug = keepaliveSlugForSong(song);
    if (!slug) return null;
    const mediaId = song.sourceRef?.kind === 'online' ? song.sourceRef.mediaId : null;
    if (!mediaId) return null;
    const resolution = await fetchKeepaliveUrl(slug, mediaId, quality);
    if (!resolution) return null;
    return { url: resolution.url, fetchedAt: Date.now(), quality };
};

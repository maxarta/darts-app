/** LAN MJPEG URL from the iOS shell — shown on the club TV. */

let visionStreamUrl: string | null = null;

export function setVisionStreamUrl(url: string | null): void {
  visionStreamUrl = url && url.trim() ? url.trim() : null;
}

export function getVisionStreamUrl(): string | null {
  return visionStreamUrl;
}

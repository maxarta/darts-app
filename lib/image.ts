export type StaticImageData = {
  src: string;
  height: number;
  width: number;
  blurDataURL?: string;
};

/** Normalize Vite URL string imports into Next-compatible StaticImageData. */
export function asStaticImage(
  src: string,
  width = 512,
  height = 512
): StaticImageData {
  return { src, width, height };
}

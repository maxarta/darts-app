import {
  forwardRef,
  useEffect,
  useRef,
  type CSSProperties,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from "react";

export type StaticImageData = {
  src: string;
  height: number;
  width: number;
  blurDataURL?: string;
};

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | StaticImageData;
  alt: string;
  width?: number | `${number}`;
  height?: number | `${number}`;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  placeholder?: "blur" | "empty";
  blurDataURL?: string;
  unoptimized?: boolean;
  sizes?: string;
};

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  {
    src,
    alt,
    width,
    height,
    fill,
    className,
    style,
    priority,
    onLoad,
    ...rest
  },
  forwardedRef
) {
  const localRef = useRef<HTMLImageElement | null>(null);
  const notifiedSrcRef = useRef<string | null>(null);
  const resolved = typeof src === "string" ? src : src.src;
  const w = width ?? (typeof src === "object" ? src.width : undefined);
  const h = height ?? (typeof src === "object" ? src.height : undefined);

  const setRefs = (el: HTMLImageElement | null) => {
    localRef.current = el;
    if (typeof forwardedRef === "function") forwardedRef(el);
    else if (forwardedRef) forwardedRef.current = el;
  };

  // Cached images may skip onLoad after React attaches the handler.
  useEffect(() => {
    notifiedSrcRef.current = null;
    const el = localRef.current;
    if (!el || !onLoad) return;
    if (el.complete && el.naturalWidth > 0) {
      notifiedSrcRef.current = resolved;
      onLoad({ currentTarget: el, target: el } as SyntheticEvent<HTMLImageElement>);
    }
  }, [resolved, onLoad]);

  const mergedStyle: CSSProperties = fill
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        ...style,
      }
    : { ...style };

  return (
    <img
      ref={setRefs}
      src={resolved}
      alt={alt}
      width={fill ? undefined : w}
      height={fill ? undefined : h}
      className={className}
      style={mergedStyle}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onLoad={onLoad}
      {...rest}
    />
  );
});

export default Image;

"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * <img> wrapper that renders a soft brand-tinted shimmer until the real
 * image fires its `onLoad`, then fades the image in over 300ms.
 *
 * Cache-safe: when the browser serves an image from cache the native `onLoad`
 * event can fire BEFORE React has a chance to attach the listener — leaving
 * the component stuck on the shimmer. We mitigate that by checking
 * `img.complete && img.naturalWidth > 0` in an effect on mount.
 *
 * If the image fails (broken URL, CORS, etc.) we silently flip to "loaded"
 * and let the parent's gradient placeholder show through, so the user
 * doesn't see a forever-shimmer.
 *
 * Doesn't use next/image because most catalog imagery is on S3 + we don't
 * want to fight remote-pattern config; the LCP cost of a plain <img> is
 * acceptable for these decorative thumbnails.
 */
export function BlurImage({
  src,
  alt,
  className,
  imgClassName,
}: {
  src: string;
  alt: string;
  /** Applied to the wrapper (sizing + rounding). */
  className?: string;
  /** Applied to the <img> element (object-fit, transitions extra). */
  imgClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Cache-safe completion check — runs once on mount and again whenever the
  // src changes. If the browser already has the bytes, `complete` will be
  // true and `naturalWidth` non-zero, but `onLoad` may have already fired.
  useEffect(() => {
    setErrored(false);
    setLoaded(false);
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  const showPlaceholder = !loaded && !errored;
  const showImage = loaded && !errored;

  return (
    <div className={cn("relative overflow-hidden bg-muted/70", className)}>
      {showPlaceholder ? (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-brand-100/70 via-brand-200/40 to-brand-300/30"
          />
          <div className="shimmer-overlay" />
        </>
      ) : null}

      {/* Two-layer setup so the load-in (opacity) tween and any hover-time
          tween (scale, etc.) live on different elements. Otherwise a single
          `transition-all` ends up fighting between the load animation and
          the hover effect supplied via `imgClassName`. */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-500",
          showImage ? "opacity-100" : "opacity-0",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setErrored(true);
            setLoaded(true);
          }}
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            imgClassName,
          )}
        />
      </div>
    </div>
  );
}

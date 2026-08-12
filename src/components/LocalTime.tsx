"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/dates";

/**
 * Renders a stored UTC instant in the viewer's own timezone.
 *
 * Only the browser knows that zone, so the first render deliberately reuses the
 * server's UTC output — identical markup, therefore no hydration mismatch — and
 * an effect re-formats it once mounted. Without JavaScript it stays on UTC,
 * which the zone label keeps honest rather than merely wrong.
 */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => formatDateTime(iso));

  useEffect(() => {
    setText(formatDateTime(iso, Intl.DateTimeFormat().resolvedOptions().timeZone));
  }, [iso]);

  return <time dateTime={iso}>{text}</time>;
}

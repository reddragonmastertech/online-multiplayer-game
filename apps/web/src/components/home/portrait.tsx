import { useState } from "react";
import { cn } from "@/lib/utils";

export function portraitUrl(id: number) {
  const img = (Math.abs(id) % 70) + 1;
  return `https://i.pravatar.cc/160?img=${img}`;
}

export function photoUrl(seed: string, width: number, height = width) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}

export const logoUrl = photoUrl("rps-arena-mark", 128, 128);

function fallbackSrc(label: string) {
  const hue = [...label].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const initial = (label.trim()[0] ?? "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="hsl(${hue} 42% 32%)"/><text x="80" y="98" text-anchor="middle" fill="white" font-size="68" font-family="Segoe UI,sans-serif">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function Portrait({
  id,
  name,
  className,
}: {
  id: number;
  name: string;
  className?: string;
}) {
  const [src, setSrc] = useState(() => portraitUrl(id));

  return (
    <img
      src={src}
      alt=""
      className={cn("bg-[#1a2740] object-cover", className)}
      onError={() => setSrc(fallbackSrc(name))}
    />
  );
}

export function Photo({
  seed,
  name,
  className,
}: {
  seed: string;
  name: string;
  className?: string;
}) {
  const [src, setSrc] = useState(() => photoUrl(seed, 240, 160));

  return (
    <img
      src={src}
      alt={name}
      className={cn("bg-[#1a2740] object-cover", className)}
      onError={() => setSrc(fallbackSrc(name))}
    />
  );
}

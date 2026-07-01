/**
 * StickerArt — renders the inline SVG artwork for a milestone sticker.
 * Falls back to the legacy emoji if no SVG exists for the given days value.
 */

import { STICKER_SVG } from '../services/protein/milestoneRewardService';

interface StickerArtProps {
  days:      number;
  fallback:  string;  // legacy emoji
  size?:     number;
  locked?:   boolean;
  style?:    React.CSSProperties;
}

export default function StickerArt({ days, fallback, size = 56, locked = false, style }: StickerArtProps) {
  const svg = STICKER_SVG[days];

  const wrapStyle: React.CSSProperties = {
    width:  size,
    height: size,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    filter: locked ? 'grayscale(1) opacity(0.3)' : 'none',
    ...style,
  };

  if (!svg) {
    return (
      <span style={{ ...wrapStyle, fontSize: size * 0.55, lineHeight: 1 }}>
        {locked ? '❓' : fallback}
      </span>
    );
  }

  return (
    <span
      style={wrapStyle}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

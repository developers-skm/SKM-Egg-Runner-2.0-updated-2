import { STICKER_PNG } from '../services/protein/milestoneRewardService';

interface StickerArtProps {
  days:      number;
  fallback:  string;
  size?:     number;
  locked?:   boolean;
  style?:    React.CSSProperties;
}

export default function StickerArt({ days, fallback, size = 56, locked = false, style }: StickerArtProps) {
  const src = STICKER_PNG[days];

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

  if (!src) {
    return (
      <span style={{ ...wrapStyle, fontSize: size * 0.55, lineHeight: 1 }}>
        {locked ? '❓' : fallback}
      </span>
    );
  }

  return (
    <span style={wrapStyle}>
      <img
        src={src}
        alt={`${days}-day sticker`}
        width={size}
        height={size}
        style={{ objectFit: 'contain', width: size, height: size }}
        onError={e => {
          const span = e.currentTarget.parentElement;
          if (span) {
            span.textContent = locked ? '❓' : fallback;
            (span as HTMLElement).style.fontSize = `${size * 0.55}px`;
            (span as HTMLElement).style.lineHeight = '1';
          }
        }}
      />
    </span>
  );
}

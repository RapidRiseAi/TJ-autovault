import { cn } from '@/lib/utils';

const RING_RED = '#dc2626';
const RING_BLACK = '#111111';
const RING_GREEN = '#15803d';
const RING_NEUTRAL = '#d1d5db';

export type RingSegmentTone = 'negative' | 'neutral' | 'positive';

export type RingSegment = {
  value: number;
  tone: RingSegmentTone;
};

function toneToColor(tone: RingSegmentTone) {
  if (tone === 'negative') return RING_RED;
  if (tone === 'positive') return RING_GREEN;
  return RING_BLACK;
}

export function SegmentRing({
  centerLabel,
  subLabel,
  className,
  size = 112,
  segments,
  total,
  neutralRemainder = true
}: {
  segments: RingSegment[];
  total?: number;
  centerLabel: string;
  subLabel?: string;
  className?: string;
  size?: number;
  neutralRemainder?: boolean;
}) {
  const ringStrokeWidth = 6;
  const radius = (size - ringStrokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const positiveSegments = segments.filter((segment) => segment.value > 0);
  const usedTotal = positiveSegments.reduce(
    (sum, segment) => sum + segment.value,
    0
  );
  const baseTotal = Math.max(total ?? usedTotal, 0);
  const ringTotal =
    baseTotal > usedTotal
      ? baseTotal
      : usedTotal > 0
        ? usedTotal
        : neutralRemainder
          ? 1
          : 0;

  const normalized =
    ringTotal > 0
      ? positiveSegments
          .map((segment) => ({
            tone: segment.tone,
            ratio: Math.min(segment.value / ringTotal, 1)
          }))
          .filter((segment) => segment.ratio > 0)
      : [];

  const gap = Math.min(3, circumference * 0.015);
  const totalGaps = Math.max(normalized.length - 1, 0) * gap;
  const drawableCircumference = Math.max(circumference - totalGaps, 0);

  let offset = 0;

  return (
    <div
      className={cn(
        'relative inline-flex flex-col items-center justify-center',
        className
      )}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={RING_NEUTRAL}
            strokeWidth={ringStrokeWidth}
          />
          {normalized.map((segment, index) => {
            const strokeLength = drawableCircumference * segment.ratio;
            const strokeDasharray = `${strokeLength} ${circumference}`;
            const strokeDashoffset = -offset;
            offset += strokeLength + (index < normalized.length - 1 ? gap : 0);

            return (
              <circle
                key={`${segment.tone}-${index}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={toneToColor(segment.tone)}
                strokeWidth={ringStrokeWidth}
                strokeLinecap="round"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
              />
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <p className="text-[22px] font-semibold leading-none text-black">{centerLabel}</p>
        {subLabel ? (
          <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-gray-500">
            {subLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}

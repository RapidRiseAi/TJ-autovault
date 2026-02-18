import { cn } from '@/lib/utils';

const RED = '#dc2626';
const BLACK = '#111111';
const GRAY = '#d1d5db';

type SegmentTone = 'urgent' | 'normal' | 'low';

function toneColor(tone: SegmentTone) {
  if (tone === 'urgent') return RED;
  if (tone === 'normal') return BLACK;
  return GRAY;
}

export function SegmentRing({
  mode,
  segments = [],
  value = 0,
  total = 0,
  centerLabel,
  subLabel,
  className,
  size = 132
}: {
  mode: 'count' | 'value';
  segments?: SegmentTone[];
  value?: number;
  total?: number;
  centerLabel: string;
  subLabel?: string;
  className?: string;
  size?: number;
}) {
  const ringStrokeWidth = 9;
  const radius = (size - ringStrokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const segmentGap = 5;

  const clampedTotal = Math.max(total, 0);
  const clampedValue = Math.max(Math.min(value, clampedTotal || value), 0);
  const percent =
    clampedTotal <= 0 ? 0 : Math.min(clampedValue / clampedTotal, 1);

  const visibleSegments =
    mode !== 'count'
      ? []
      : segments.length <= 12
        ? segments
        : [...segments.slice(0, 11), segments[11]];
  const segmentCount = visibleSegments.length;
  const baseSegmentLength =
    segmentCount > 0 ? circumference / segmentCount : circumference;
  const drawLength = Math.max(baseSegmentLength - segmentGap, 2);

  return (
    <div
      className={cn(
        'relative inline-flex flex-col items-center justify-center',
        className
      )}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {mode === 'value' ? (
            <>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={GRAY}
                strokeWidth={ringStrokeWidth}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={RED}
                strokeWidth={ringStrokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${circumference * percent} ${circumference}`}
              />
            </>
          ) : (
            <>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={GRAY}
                strokeWidth={ringStrokeWidth}
              />
              {visibleSegments.map((segment, index) => (
                <circle
                  key={`${segment}-${index}`}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={toneColor(segment)}
                  strokeWidth={ringStrokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${drawLength} ${circumference}`}
                  strokeDashoffset={-(index * baseSegmentLength)}
                />
              ))}
            </>
          )}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-2xl font-semibold leading-none text-black">
          {centerLabel}
        </p>
        {subLabel ? (
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">
            {subLabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}

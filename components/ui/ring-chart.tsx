import { cn } from '@/lib/utils';

export type RingChartSegment = {
  value: number;
  color: string;
};

export function RingChart({
  segments,
  centerLabel,
  subLabel,
  className,
  size = 112,
  strokeWidth = 5,
  fallbackColor = '#d4d4d8'
}: {
  segments: RingChartSegment[];
  centerLabel: string;
  subLabel: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
  fallbackColor?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const positiveSegments = segments.filter((segment) => segment.value > 0);
  const total = positiveSegments.reduce(
    (sum, segment) => sum + segment.value,
    0
  );
  const normalized =
    total > 0
      ? positiveSegments.map((segment) => ({
          color: segment.color,
          ratio: segment.value / total
        }))
      : [{ color: fallbackColor, ratio: 1 }];

  const gap = normalized.length > 1 ? Math.min(2, circumference * 0.009) : 0;
  const totalGap = Math.max(normalized.length - 1, 0) * gap;
  const drawableCircumference = Math.max(circumference - totalGap, 0);

  let offset = 0;

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center',
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
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={fallbackColor}
            strokeWidth={strokeWidth}
          />
          {normalized.map((segment, index) => {
            const strokeLength = drawableCircumference * segment.ratio;
            const strokeDasharray = `${strokeLength} ${circumference}`;
            const strokeDashoffset = -offset;
            offset += strokeLength + (index < normalized.length - 1 ? gap : 0);

            return (
              <circle
                key={`${segment.color}-${index}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
              />
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-[28px] font-semibold leading-none text-black">
          {centerLabel}
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-gray-500">
          {subLabel}
        </p>
      </div>
    </div>
  );
}

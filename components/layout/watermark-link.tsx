'use client';

import Image from 'next/image';
import { appConfig } from '@/lib/config/app-config';
import rapidRiseLogo from '@/rapid_rise_ai_logo.png';

const RAPID_RISE_URL = 'https://www.rapidriseai.com';

export function WatermarkLink() {
  const handleClick = () => {
    const shouldRedirect = window.confirm(
      'Do you want to be redirected to the Rapid Rise AI website?'
    );

    if (shouldRedirect) {
      window.open(RAPID_RISE_URL, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <button
      type="button"
      className="watermark"
      onClick={handleClick}
      aria-label="Visit Rapid Rise AI website"
    >
      <Image
        src={rapidRiseLogo}
        alt="Rapid Rise AI logo"
        width={18}
        height={18}
        className="watermark-logo"
      />
      <span>{appConfig.branding.defaultWatermarkText}</span>
    </button>
  );
}

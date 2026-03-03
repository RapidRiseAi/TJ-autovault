'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Modal } from '@/components/ui/modal';
import { appConfig } from '@/lib/config/app-config';
import rapidRiseLogo from '@/rapid_rise_ai_logo.png';

const RAPID_RISE_URL = 'https://www.rapidriseai.com';

export function WatermarkLink() {
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  const handleClick = () => {
    setIsPromptOpen(true);
  };

  const handleVisitWebsite = () => {
    setIsPromptOpen(false);
    window.open(RAPID_RISE_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
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
        <span className="watermark-version">Preview v{appConfig.branding.previewVersion}</span>
      </button>

      <Modal
        open={isPromptOpen}
        title="Visit Rapid Rise AI"
        onClose={() => setIsPromptOpen(false)}
      >
        <div className="space-y-4 text-sm text-gray-700">
          <p>Do you want to be redirected to the Rapid Rise AI website?</p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsPromptOpen(false)}
              className="rounded-xl border border-black/15 px-4 py-2 font-medium text-black hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleVisitWebsite}
              className="rounded-xl bg-black px-4 py-2 font-medium text-white hover:bg-black/85"
            >
              Visit website
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

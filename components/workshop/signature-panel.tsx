'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-provider';

type SignaturePanelProps = {
  workshopId: string;
  profileId: string;
  lastUpdatedAt: string | null;
};

export function SignaturePanel({ workshopId, profileId, lastUpdatedAt }: SignaturePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasDrawnRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { pushToast } = useToast();

  const formattedUpdatedAt = useMemo(() => {
    if (!lastUpdatedAt) return null;
    return new Date(lastUpdatedAt).toLocaleString('en-ZA', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Johannesburg'
    });
  }, [lastUpdatedAt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 2;
    context.strokeStyle = '#111827';
  }, []);

  function getPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const point = getPoint(event);
    if (!context || !point) return;

    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const point = getPoint(event);
    if (!context || !point) return;

    context.lineTo(point.x, point.y);
    context.stroke();
    if (!hasDrawnRef.current) {
      hasDrawnRef.current = true;
      setHasInk(true);
    }
  }

  function stopDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    setHasInk(false);
  }

  async function saveSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsSaving(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const response = await fetch('/api/workshop/profile/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, workshopId, profileId })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not save signature');

      pushToast({ title: 'Signature saved', tone: 'success' });
      window.location.reload();
    } catch (error) {
      pushToast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Could not save signature',
        tone: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="md:col-span-2 space-y-3 rounded-2xl border border-black/15 bg-gray-50/70 p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Signature</h3>
        <p className="text-xs text-gray-500">This signature will be applied to inspection reports.</p>
        {formattedUpdatedAt ? <p className="mt-1 text-xs text-gray-500">Last updated: {formattedUpdatedAt}</p> : null}
      </div>
      <canvas
        ref={canvasRef}
        className="h-44 w-full rounded-xl border border-black/15 bg-[radial-gradient(circle_at_top,_#ffffff,_#f5f5f5)] touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={isSaving} onClick={clearSignature}>Clear</Button>
        <Button type="button" disabled={!hasInk || isSaving} onClick={() => void saveSignature()}>
          {isSaving ? 'Saving...' : 'Save signature'}
        </Button>
      </div>
    </div>
  );
}

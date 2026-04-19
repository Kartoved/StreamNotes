import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface Props {
  text: string;
  size?: number;
}

export function QRCodeCanvas({ text, size = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !text) return;
    QRCode.toCanvas(canvas, text, {
      width: size,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    }).catch((err) => {
      console.error('[QR] render failed', err);
    });
  }, [text, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: size,
        height: size,
        background: '#ffffff',
        borderRadius: 'var(--radius)',
        padding: '8px',
        boxSizing: 'content-box',
      }}
    />
  );
}

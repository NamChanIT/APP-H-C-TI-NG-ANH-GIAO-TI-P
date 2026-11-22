'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';

// Landmarks follow the lip seam in the supplied 2048 × 2048 portrait.
const portraitSize = 2048;
const scale = 0.5;
const seam = [[1300, 950], [1350, 960], [1410, 972], [1480, 984], [1540, 983], [1600, 969], [1655, 949], [1690, 918]];
const firstX = seam[0][0];
const lastX = seam.at(-1)[0];
const patch = [firstX * scale, 390, (lastX - firstX) * scale, 195];

function lipStrips() {
  const strips = [];
  for (let i = 1; i < seam.length; i++) {
    const [left, top] = seam[i - 1];
    const [right, bottom] = seam[i];
    for (let x = left; x < right; x += 2) {
      const y = top + (bottom - top) * ((x + 1 - left) / (right - left));
      const position = (x + 1 - firstX) / (lastX - firstX);
      strips.push({
        x, y,
        taper: Math.pow(Math.sin(Math.PI * position), 0.83),
        position
      });
    }
  }
  return strips;
}

const strips = lipStrips();

function renderMouth(ctx, image, opening, rounded) {
  ctx.clearRect(...patch);
  if (opening < 0.025) return;
  for (const { x, y, taper, position } of strips) {
    const width = 2;
    const dx = x * scale;
    const upper = 80 * taper + 2;
    const lower = 112 * taper + 2;
    const shape = taper * (rounded ? 0.72 + 0.28 * taper : 1);
    const lift = opening * 16 * shape;
    const drop = opening * 62 * shape;
    const upperEdge = (y - lift) * scale;
    const lowerEdge = (y + drop) * scale;
    ctx.drawImage(image, x, y - upper, width, upper, dx, (y - upper) * scale, 1, (upper - lift) * scale);
    ctx.fillStyle = '#321219';
    ctx.fillRect(dx, upperEdge, 1, lowerEdge - upperEdge + 0.5);
    if (opening > 0.25 && position > 0.22 && position < 0.78) {
      ctx.fillStyle = '#aa8f83';
      ctx.fillRect(dx, upperEdge, 1, Math.min(5, opening * 9) * shape);
    }
    ctx.fillStyle = '#59262d';
    ctx.fillRect(dx, lowerEdge - Math.min(3, drop * 0.15), 1, Math.min(3, drop * 0.15));
    ctx.drawImage(image, x, y, width, lower, dx, lowerEdge, 1, (lower - drop) * scale);
  }
}

function speechShape(speech, now) {
  if (!speech?.active) return { opening: 0, rounded: false };
  const elapsed = now - speech.at;
  const sequence = speech.word || '';
  const step = Math.max(58, 92 / (speech.rate || 1));
  const index = Math.floor(elapsed / step);
  const letter = sequence[index];
  const pulse = Math.sin(Math.PI * ((elapsed % step) / step));
  if (letter && /[bmp]/i.test(letter)) return { opening: 0.06, rounded: false };
  if (letter && /[aehiy]/i.test(letter)) return { opening: 0.42 + pulse * 0.49, rounded: false };
  if (letter && /[ouw]/i.test(letter)) return { opening: 0.31 + pulse * 0.43, rounded: true };
  const cadence = 0.5 + 0.5 * Math.sin(elapsed / 74) * Math.cos(elapsed / 183);
  return { opening: 0.11 + cadence * 0.49, rounded: letter ? false : cadence > 0.7 };
}

export default function TalkingPortrait({ speaking, speechMotion }) {
  const canvas = useRef(null);
  const photo = useRef(null);

  useEffect(() => {
    const overlay = canvas.current;
    const context = overlay?.getContext('2d');
    if (!context || !speaking) return;
    let frame;
    let previousTime = 0;
    let previousOpening = 0;
    function animate(now) {
      const image = photo.current;
      if (image?.complete && image.naturalWidth && now - previousTime >= 1000 / 30) {
        const { opening, rounded } = speechShape(speechMotion.current, now);
        previousOpening += (opening - previousOpening) * (opening === 0 ? 0.8 : 0.64);
        renderMouth(context, image, previousOpening, rounded);
        previousTime = now;
      }
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      context.clearRect(...patch);
    };
  }, [speaking, speechMotion]);

  return <div className="avatar portrait-avatar" aria-hidden="true">
    <Image ref={photo} src="/companion-portrait.jpg" alt="" fill priority unoptimized />
    <canvas ref={canvas} className="portrait-motion" width={portraitSize * scale} height={portraitSize * scale} />
  </div>;
}

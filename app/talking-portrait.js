'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { createPortraitWarp } from './portrait-warp';

// Landmarks follow the lip seam in the supplied 2048 × 2048 portrait.
const portraitSize = 2048;
const scale = 0.5;
const seam = [[1300, 950], [1350, 960], [1410, 972], [1480, 984], [1540, 983], [1600, 969], [1655, 949], [1690, 918]];
const mouthPatch = [650, 390, 196, 195];
const eyesPatch = [580, 190, 335, 92];
const eyeSeams = [
  [[1160, 502], [1200, 484], [1250, 475], [1290, 479], [1340, 490], [1382, 502], [1406, 513]],
  [[1590, 511], [1618, 492], [1666, 475], [1710, 468], [1760, 469], [1804, 480], [1827, 490]]
];

function makeStrips(points) {
  const firstX = points[0][0];
  const lastX = points.at(-1)[0];
  const strips = [];
  for (let i = 1; i < points.length; i++) {
    const [left, top] = points[i - 1];
    const [right, bottom] = points[i];
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

const strips = makeStrips(seam);
const eyes = eyeSeams.map(makeStrips);

function renderBlink(ctx, image, closure) {
  ctx.clearRect(...eyesPatch);
  if (closure < 0.025) return;
  for (const eye of eyes) {
    for (const { x, y, taper } of eye) {
      const top = y - 43 * taper;
      const bottom = y + 42 * taper;
      const topEdge = top - 34 * taper - 2;
      const bottomEdge = bottom + 25 * taper + 2;
      const lid = y + 25 * taper;
      const upperClose = top + (lid - top) * closure * 0.93;
      const lowerClose = bottom - (bottom - lid) * closure * 0.91;
      const dx = x * scale;
      const strip = (from, to, targetFrom, targetTo) =>
        ctx.drawImage(image, x, from, 2, to - from, dx, targetFrom * scale, 1, (targetTo - targetFrom) * scale);
      strip(topEdge, top, topEdge, upperClose);
      strip(top, bottom, upperClose, lowerClose);
      strip(bottom, bottomEdge, lowerClose, bottomEdge);
    }
  }
}

function renderMouth(ctx, image, opening, rounded) {
  ctx.clearRect(...mouthPatch);
  if (opening < 0.025) return;
  for (const { x, y, taper, position } of strips) {
    const width = 2;
    const dx = x * scale;
    const upper = 80 * taper + 2;
    const lower = 112 * taper + 2;
    const shape = taper * (1 - rounded * (1 - taper) * 0.34);
    const lift = opening * (13 + 5 * rounded) * shape;
    const drop = opening * (55 + 7 * rounded) * shape;
    const upperEdge = (y - lift) * scale;
    const lowerEdge = (y + drop) * scale;
    ctx.drawImage(image, x, y - upper, width, upper, dx, (y - upper) * scale, 1, (upper - lift) * scale);
    ctx.fillStyle = '#321219';
    ctx.fillRect(dx, upperEdge, 1, lowerEdge - upperEdge + 0.5);
    if (opening > 0.25 && position > 0.22 && position < 0.78) {
            ctx.fillStyle = 'rgba(222, 205, 189, 0.66)';
      ctx.fillRect(dx, upperEdge, 1, Math.min(4, opening * 8) * shape * (1 - rounded * 0.65));
    }
    ctx.fillStyle = '#59262d';
    ctx.fillRect(dx, lowerEdge - Math.min(3, drop * 0.15), 1, Math.min(3, drop * 0.15));
    ctx.drawImage(image, x, y, width, lower, dx, lowerEdge, 1, (lower - drop) * scale);
  }
}

function speechShape(speech, now) {
  if (!speech?.active) return { opening: 0, rounded: false };
  const elapsed = Math.max(0, now - speech.at);
  const sequence = speech.word || '';
  const step = Math.max(58, 92 / (speech.rate || 1));
  const index = Math.floor(elapsed / step);
  const letter = sequence[index];
  const pulse = Math.sin(Math.PI * ((elapsed % step) / step));
  if (letter && /[bmp]/i.test(letter)) return { opening: 0.02 + pulse * 0.08, rounded: false };
  if (letter && /[aehiy]/i.test(letter)) return { opening: 0.42 + pulse * 0.49, rounded: false };
  if (letter && /[ouw]/i.test(letter)) return { opening: 0.31 + pulse * 0.43, rounded: true };
  const cadence = 0.5 + 0.5 * Math.sin(elapsed / 67) * Math.cos(elapsed / 167);
  const rest = 0.52 + 0.48 * Math.sin(elapsed / 345) ** 2;
  return { opening: (0.04 + cadence * 0.56) * rest, rounded: !letter && cadence > 0.68 };
}

export default function TalkingPortrait({ state, speechMotion }) {
  const canvas = useRef(null);
  const photo = useRef(null);
  const head = useRef(null);
  const pose = useRef(null);
  const currentState = useRef(state);
  currentState.current = state;

  useEffect(() => {
    const overlay = canvas.current;
    const layer = pose.current;
    const context = overlay?.getContext('2d');
    const headCanvas = head.current;
    if (!context || !layer || !headCanvas) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let warp = null;
    let attemptedWarp = false;
    let featuresChanged = true;
    let currentYaw = 0;
    let frame;
    let previousTime = 0;
    let opening = 0;
    let shaping = 0;
    let paintedMouth = false;
    let paintedEyes = false;
    let currentTilt = 0;
    let currentShift = 0;
    let previousState;
    let stateSince = 0;
    let nextBlink = performance.now() + 1900;
    let blinkSince = null;

    function animate(now) {
      frame = requestAnimationFrame(animate);
      const image = photo.current;
      if (!image?.complete || !image.naturalWidth || now - previousTime < 30) return;
      const step = Math.min(80, now - previousTime);
      previousTime = now;
      const stage = currentState.current;
      if (stage !== previousState) {
        previousState = stage;
        stateSince = now;
      }

      const shape = speechShape(speechMotion?.current, now);
      const blend = 1 - Math.exp(-step / (shape.opening < opening ? 36 : 48));
      opening += (shape.opening - opening) * blend;
      shaping += (Number(shape.rounded) - shaping) * blend;
      if (opening >= 0.025 || paintedMouth) {
        renderMouth(context, image, opening, shaping);
        featuresChanged = true;
        paintedMouth = opening >= 0.025;
      }

      if (preference.matches) {
        layer.style.transform = '';
        headCanvas.hidden = true;
        overlay.style.visibility = '';
        if (paintedEyes) {
          context.clearRect(...eyesPatch);
          featuresChanged = true;
        }
        paintedEyes = false;
        blinkSince = null;
        nextBlink = now + 1700;
        return;
      }

      // Keep the blink brief, with a slightly quicker close than reopen.
      if (document.visibilityState === 'visible' && now >= nextBlink && blinkSince === null) blinkSince = now;
      if (blinkSince !== null) {
        const blinkAge = now - blinkSince;
        const closure = blinkAge <= 84 ? Math.sin(blinkAge / 84 * Math.PI / 2)
          : Math.cos(Math.min(1, (blinkAge - 84) / 109) * Math.PI / 2);
        renderBlink(context, image, closure);
        featuresChanged = true;
        paintedEyes = closure >= 0.025;
        if (blinkAge >= 193) {
          blinkSince = null;
          nextBlink = now + 2500 + Math.random() * 3100;
        }
      }

      const seconds = now / 1000;
      const attentive = stage === 'listening' || stage === 'hearing';
      const speaking = stage === 'speaking';
      const thinking = stage === 'thinking';
      const activity = speaking ? 1 : attentive ? 0.82 : 0.3;
      const settle = Math.min(1, (now - stateSince) / 720);
      const nod = stage === 'hearing' ? Math.sin(Math.PI * settle) * 8 : 0;
      const pitch = (thinking ? -1.65 : attentive ? 1.05 : 0) + Math.sin(seconds * 1.15) * activity * 0.9;
      const shift = nod + (attentive ? 2.4 : thinking ? -3.0 : 0) + Math.cos(seconds * 1.28) * activity * 2.1;
      const yaw = (thinking ? -0.52 : attentive ? 0.43 : 0) + Math.sin(seconds * 0.83) * activity * 0.24;
      currentTilt += (pitch - currentTilt) * 0.15;
      currentShift += (shift - currentShift) * 0.15;
      currentYaw += (yaw - currentYaw) * 0.13;
      const horizontal = Math.sin(seconds * 0.91) * (0.8 + activity * 1.5);

      if (!attemptedWarp) {
        attemptedWarp = true;
        warp = createPortraitWarp(headCanvas);
      }
      if (warp?.draw(image, overlay, featuresChanged, horizontal / 500, currentShift / 470,
        currentTilt * Math.PI / 180, currentYaw)) {
        featuresChanged = false;
        headCanvas.hidden = false;
        overlay.style.visibility = 'hidden';
        layer.style.transform = '';
      } else {
        headCanvas.hidden = true;
        overlay.style.visibility = '';
        const zoom = 1.025 + Math.sin(seconds * 1.23) * 0.003;
        layer.style.transform = `translate3d(${horizontal}px, ${currentShift * 0.55}px, 0) rotate(${currentTilt * 0.48}deg) scale(${zoom})`;
      }
    }

    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      warp?.dispose();
      headCanvas.hidden = true;
      overlay.style.visibility = '';
      context.clearRect(...mouthPatch);
      context.clearRect(...eyesPatch);
      layer.style.transform = '';
    };
  }, [speechMotion]);

  return <div className="avatar portrait-avatar" aria-hidden="true">
    <div className="portrait-pose" ref={pose}>
      <Image ref={photo} src="/companion-portrait.jpg" alt="" fill priority unoptimized />
      <canvas ref={canvas} className="portrait-motion" width={portraitSize * scale} height={portraitSize * scale} />
      <canvas ref={head} hidden className="portrait-head-motion" width={768} height={768} />
    </div>
  </div>;
}

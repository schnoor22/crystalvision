/**
 * Crystal Vision Co. � Squeegee Animation (v2)
 *
 * Dramatically visible dirty-window overlay on a canvas.
 * A realistic squeegee wipes horizontal bands, erasing the
 * grime and revealing the clean site underneath.
 *
 * Key improvements over v1:
 *  - Much darker/denser grime layer so the dirty window is OBVIOUS
 *  - Larger, more visible squeegee with realistic shading
 *  - Soap wash phase has visible bubbles & blue tint
 *  - Proper compositing so wiped areas become fully transparent
 *  - Works with any hero image underneath
 */

import { gsap } from "gsap";

// -- Configuration -------------------------------------------
const CFG = {
  // Timing
  holdDirty: 1.0,         // seconds showing dirty window before wipe
  soapFloodDur: 0.5,      // soap wash animation
  wipePasses: 3,           // horizontal passes
  wipeSpeed: 0.9,          // seconds per pass
  passGap: 0.1,            // gap between passes
  fadeOutDur: 0.4,         // final overlay fadeout

  // Appearance
  squeegeeW: 300,          // px blade width
  bladeH: 10,              // px rubber blade thickness
  handleH: 50,             // px handle length
  grimeAlpha: 0.7,         // base grime opacity (0-1) � heavy!
  spotCount: 120,          // hard-water spots
  smudgeCount: 16,         // greasy smudges
  dripCount: 12,           // water drips after each pass
};

let canvas, ctx, w, h;
let tl; // GSAP timeline
let dirtySnap; // ImageData snapshot of dirty+soap layer
let skipped = false;

// -- Public API ----------------------------------------------

export function shouldPlayAnimation() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return true;
}

export function initAnimation() {
  canvas = document.getElementById("squeegee-canvas");
  const overlay = document.getElementById("animation-overlay");
  const skipBtn = document.getElementById("skip-btn");
  if (!canvas || !overlay) return;

  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);

  // 1. Paint the dirty window
  paintDirtyWindow();
  dirtySnap = ctx.getImageData(0, 0, w, h);

  // 2. Build GSAP timeline
  buildTimeline(overlay, skipBtn);

  // 3. Skip handler
  if (skipBtn) skipBtn.addEventListener("click", skip);
}

export function skip() {
  if (skipped) return;
  skipped = true;
  if (tl) tl.progress(1);
  finish();
}

// -- Canvas Helpers ------------------------------------------

function resize() {
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
}

// -- Paint Dirty Window --------------------------------------

function paintDirtyWindow() {
  // 1. Heavy brownish-gray grime fill
  ctx.fillStyle = `rgba(120, 110, 90, ${CFG.grimeAlpha})`;
  ctx.fillRect(0, 0, w, h);

  // 2. Noise texture
  addNoise(0.12);

  // 3. Hard-water spots
  for (let i = 0; i < CFG.spotCount; i++) {
    const x = rand(w), y = rand(h), r = 4 + rand(22);
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(200,195,180,${0.18 + rand(0.18)})`);
    g.addColorStop(0.85, `rgba(180,175,160,${0.10 + rand(0.10)})`);
    g.addColorStop(1, "rgba(180,175,160,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Mineral ring
    ctx.beginPath();
    ctx.arc(x, y, r * 0.65, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.09 + rand(0.09)})`;
    ctx.lineWidth = 1 + rand(1.5);
    ctx.stroke();
  }

  // 4. Greasy smudges
  for (let i = 0; i < CFG.smudgeCount; i++) {
    const x = rand(w), y = rand(h);
    const rx = 25 + rand(70), ry = 18 + rand(50);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand(Math.PI));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(170,160,140,${0.15 + rand(0.12)})`);
    g.addColorStop(1, "rgba(170,160,140,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 5. Dried drip streaks
  for (let i = 0; i < 10; i++) {
    const sx = rand(w), sy = rand(h * 0.3);
    const length = 60 + rand(180);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    let cy = sy;
    while (cy < sy + length) {
      cy += 6 + rand(12);
      ctx.lineTo(sx + (Math.random() - 0.5) * 5, cy);
    }
    ctx.strokeStyle = `rgba(200,195,180,${0.08 + rand(0.08)})`;
    ctx.lineWidth = 1.5 + rand(2);
    ctx.stroke();
  }

  // 6. Edge vignette (heavier grime at edges)
  const vg = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.25,
    w / 2, h / 2, Math.max(w, h) * 0.75
  );
  vg.addColorStop(0, "rgba(100,90,70,0)");
  vg.addColorStop(1, "rgba(100,90,70,0.35)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function addNoise(strength) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 50;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
    d[i + 3] = Math.min(255, d[i + 3] + rand(strength * 255));
  }
  ctx.putImageData(img, 0, 0);
}

// -- Timeline ------------------------------------------------

function buildTimeline(overlay, skipBtn) {
  tl = gsap.timeline({ onComplete: finish });

  // Phase 1 � hold the dirty window
  tl.to({}, { duration: CFG.holdDirty });

  // Phase 2 � soap wash (blue tint + bubbles)
  tl.call(applySoapWash);
  tl.to({}, { duration: CFG.soapFloodDur });

  // Phase 3 � squeegee wipe passes
  const passH = h / CFG.wipePasses;
  const bladeW = Math.min(CFG.squeegeeW, w * 0.45);

  for (let p = 0; p < CFG.wipePasses; p++) {
    const yTop = p * passH;
    const yBot = yTop + passH + 15; // small overlap
    const rightward = p % 2 === 0;
    const prog = { v: 0 };

    tl.to(prog, {
      v: 1,
      duration: CFG.wipeSpeed,
      ease: "power2.inOut",
      onUpdate() {
        renderWipeFrame(prog.v, yTop, yBot, rightward, bladeW, p);
      },
    }, p === 0 ? "+=0" : `+=${CFG.passGap}`);
  }

  // Phase 4 � fade away any residual film
  tl.to(canvas, { opacity: 0, duration: CFG.fadeOutDur, ease: "power2.out" });
}

// -- Soap Wash -----------------------------------------------

function applySoapWash() {
  ctx.putImageData(dirtySnap, 0, 0);

  // Tinted blue film
  const sg = ctx.createLinearGradient(0, 0, 0, h);
  sg.addColorStop(0, "rgba(0,150,199,0.3)");
  sg.addColorStop(0.5, "rgba(72,202,228,0.22)");
  sg.addColorStop(1, "rgba(0,150,199,0.28)");
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);

  // Soap bubbles
  for (let i = 0; i < 40; i++) {
    const bx = rand(w), by = rand(h), br = 5 + rand(14);
    const bg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, br * 0.1, bx, by, br);
    bg.addColorStop(0, "rgba(255,255,255,0.45)");
    bg.addColorStop(0.6, "rgba(173,232,244,0.18)");
    bg.addColorStop(1, "rgba(173,232,244,0)");
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    // Highlight dot
    ctx.beginPath();
    ctx.arc(bx - br * 0.25, by - br * 0.25, br * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();
  }

  // Snapshot WITH soap for wipe compositing
  dirtySnap = ctx.getImageData(0, 0, w, h);
}

// -- Wipe Frame ----------------------------------------------

function renderWipeFrame(progress, yTop, yBot, rightward, bladeW, passIdx) {
  // Re-stamp dirty snapshot
  ctx.putImageData(dirtySnap, 0, 0);

  // Erase already-wiped regions
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,1)";

  // 1. All passes above are fully cleared
  if (yTop > 0) {
    ctx.fillRect(0, 0, w, yTop + 16);
  }

  // 2. Current pass — area behind squeegee (extend through blade width
  //    so no grime peeks through gaps around the narrow handle pole)
  const travel = w + bladeW;
  const posX = rightward
    ? -bladeW + travel * progress
    : w - travel * progress;

  if (rightward) {
    const eraseW = Math.max(0, posX + bladeW);
    if (eraseW > 0) ctx.fillRect(0, yTop, eraseW, yBot - yTop);
  } else {
    const eraseX = posX;
    const eraseW = Math.max(0, w - eraseX);
    if (eraseW > 0) ctx.fillRect(eraseX, yTop, eraseW, yBot - yTop);
  }

  ctx.restore();

  // Draw squeegee on top (normal compositing)
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  drawSqueegee(posX, yTop, yBot, bladeW);
  ctx.restore();
}

// -- Squeegee Drawing ----------------------------------------

function drawSqueegee(x, yTop, yBot, bladeW) {
  const midY = yTop + (yBot - yTop) / 2;

  // - Handle pole -
  const poleW = 10;
  const poleX = x + bladeW / 2 - poleW / 2;
  const poleTop = midY - CFG.handleH - CFG.bladeH;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  roundRect(poleX + 3, poleTop + 3, poleW, CFG.handleH, 3);

  // Pole body (metallic gradient)
  const pg = ctx.createLinearGradient(poleX, 0, poleX + poleW, 0);
  pg.addColorStop(0, "#999");
  pg.addColorStop(0.3, "#ddd");
  pg.addColorStop(0.5, "#eee");
  pg.addColorStop(0.7, "#ddd");
  pg.addColorStop(1, "#999");
  ctx.fillStyle = pg;
  roundRect(poleX, poleTop, poleW, CFG.handleH, 3);

  // - T-bar / holder -
  const holderH = 7;
  const holderY = midY - holderH - CFG.bladeH;
  ctx.fillStyle = "#444";
  roundRect(x, holderY, bladeW, holderH, 2);

  // Highlight line on holder
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(x, holderY, bladeW, 1.5);

  // - Rubber blade -
  const bladeY = midY - CFG.bladeH;
  const bg = ctx.createLinearGradient(0, bladeY, 0, bladeY + CFG.bladeH);
  bg.addColorStop(0, "#1a3f5c");
  bg.addColorStop(1, "#0e2a42");
  ctx.fillStyle = bg;
  ctx.fillRect(x, bladeY, bladeW, CFG.bladeH);

  // Water bead along blade edge (bright cyan line)
  ctx.fillStyle = "rgba(0,180,216,0.55)";
  ctx.fillRect(x, bladeY + CFG.bladeH, bladeW, 3);

  // Gleam on rubber
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x, bladeY, bladeW, 1.5);
}

function roundRect(x, y, w2, h2, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w2 - r, y);
  ctx.quadraticCurveTo(x + w2, y, x + w2, y + r);
  ctx.lineTo(x + w2, y + h2 - r);
  ctx.quadraticCurveTo(x + w2, y + h2, x + w2 - r, y + h2);
  ctx.lineTo(x + r, y + h2);
  ctx.quadraticCurveTo(x, y + h2, x, y + h2 - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// -- Finish --------------------------------------------------

function finish() {
  const overlay = document.getElementById("animation-overlay");
  const skipBtn = document.getElementById("skip-btn");

  if (overlay) {
    overlay.style.transition = "opacity 0.3s ease";
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 350);
  }
  if (skipBtn) skipBtn.remove();

  document.body.classList.remove("no-scroll");
  window.removeEventListener("resize", resize);
  if (tl) tl.kill();
  canvas = ctx = dirtySnap = null;
}

// -- Util ----------------------------------------------------
function rand(max) { return Math.random() * max; }

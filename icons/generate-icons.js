// Run once: node icons/generate-icons.js
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2, r = size * 0.44;
  const lw = Math.max(1, size * 0.04);

  // Background
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.22);
  ctx.fillStyle = '#09090f';
  ctx.fill();

  // Outer circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth = lw * 1.2;
  ctx.stroke();

  // Vertical meridian line
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth = lw;
  ctx.stroke();

  // Horizontal equator
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = lw * 0.7;
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = '#c4b5fd';
  ctx.fill();

  return canvas.toBuffer('image/png');
}

sizes.forEach(size => {
  try {
    const buf = drawIcon(size);
    const out = path.join(__dirname, `icon${size}.png`);
    fs.writeFileSync(out, buf);
    console.log(`✓ icon${size}.png`);
  } catch (e) {
    console.error(`✗ icon${size}.png — ${e.message}`);
  }
});

/** Draws the receipt on a canvas, like a till receipt, and returns a PNG blob. */

const WIDTH = 520;
const LINE = 30;
const PAD = 32;
const TOOTH = 10;

const isSeparator = (text) => /^-+$/.test(text);

export function renderReceipt(lines) {
  const canvas = document.createElement("canvas");
  const scale = 2;
  const height = lines.length * LINE + PAD * 2 + TOOTH;
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // paper with a zig-zag bottom edge
  ctx.fillStyle = "#fffdf5";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(WIDTH, 0);
  ctx.lineTo(WIDTH, height - TOOTH);
  for (let x = WIDTH; x > 0; x -= TOOTH * 2) {
    ctx.lineTo(x - TOOTH, height);
    ctx.lineTo(x - TOOTH * 2, height - TOOTH);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#111";
  lines.forEach((text, i) => {
    const y = PAD + 18 + i * LINE;
    if (isSeparator(text)) {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = "#555";
      ctx.beginPath();
      ctx.moveTo(PAD, y - 6);
      ctx.lineTo(WIDTH - PAD, y - 6);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const heading = i < 3;
    ctx.font = `${i === 0 ? "bold 20px" : "16px"} ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = heading || i >= lines.length - 3 ? "center" : "left";
    ctx.fillText(text, ctx.textAlign === "center" ? WIDTH / 2 : PAD, y);
  });
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

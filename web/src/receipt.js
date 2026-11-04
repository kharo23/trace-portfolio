/** Draws the receipt lines on a canvas and returns a PNG blob. */

const WIDTH = 520;
const LINE = 30;
const PAD = 28;

export function renderReceipt(lines) {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = WIDTH * scale;
  canvas.height = (lines.length * LINE + PAD * 2) * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fffdf5";
  ctx.fillRect(0, 0, WIDTH, canvas.height / scale);
  ctx.fillStyle = "#111";
  ctx.font = "16px ui-monospace, Menlo, Consolas, monospace";
  lines.forEach((text, i) => {
    ctx.font = `${i === 0 ? "bold 20px" : "16px"} ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillText(text, PAD, PAD + 18 + i * LINE);
  });
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

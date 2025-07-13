// utils/svg-builder.js

export function generateSVG(moves) {
  const squareSize = 20;
  const duration = 3; // seconds
  const pieceSize = 16;

  const pieces = moves
    .filter(m => m.piece)
    .map((m, i) => {
      const startX = m.x * squareSize;
      const startY = m.y * squareSize;

      // Simulate movement distance: 1 pixel per contribution count
      const dx = m.strength * 2;
      const dy = (i % 2 === 0 ? 1 : -1) * m.strength;

      return `
<g transform="translate(${startX}, ${startY})">
  <text font-size="${pieceSize}" opacity="0.9">${m.piece}</text>
  <animateTransform
    attributeName="transform"
    type="translate"
    values="${startX},${startY}; ${startX + dx},${startY + dy}; ${startX},${startY}"
    dur="${duration}s"
    repeatCount="indefinite"
  />
</g>
`;
    }).join('\n');

  const svgWidth = 140; // Adjust based on your grid size
  const svgHeight = 100;

  return `
<svg viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text {
      font-family: "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
    }
  </style>
  ${pieces}
</svg>
  `.trim();
}

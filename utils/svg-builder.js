// utils/svg-builder.js

export function generateSVG(moves) {
  const squareSize = 20
  const pieces = moves
    .filter(m => m.piece)
    .map(m => {
      const x = m.x * squareSize
      const y = m.y * squareSize
      return `<text x="${x}" y="${y + 15}" font-size="16" opacity="0.9">${m.piece}</text>`
    }).join('\n')

  return `
<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <style>
    text {
      font-family: "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
    }
  </style>
  ${pieces}
</svg>
  `.trim()
}


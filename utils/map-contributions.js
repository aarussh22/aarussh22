
// utils/map-contributions.js

export function mapToChessMoves(days) {
  return days.map((day, index) => {
    const moveType = getPieceForCount(day.contributionCount)
    return {
      piece: moveType,
      date: day.date,
      strength: day.contributionCount,
      x: index % 7,
      y: Math.floor(index / 7),
    }
  })
}

function getPieceForCount(count) {
  if (count === 0) return null
  if (count <= 2) return '♙'  // Pawn
  if (count <= 4) return '♘'  // Knight
  if (count <= 6) return '♖'  // Rook
  if (count <= 10) return '♕' // Queen
  return '♔'                 // King
}

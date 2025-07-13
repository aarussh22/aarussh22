// generate-chess-svg.js
import { getContributionData } from './utils/github-api.js'
import { mapToChessMoves } from './utils/map-contributions.js'
import { generateSVG } from './utils/svg-builder.js'
import fs from 'fs'

// Main function
async function run() {
  const username = process.env.aarussh22 || 'aarussh22'
  const contributionData = await getContributionData(username)
  const movements = mapToChessMoves(contributionData)
  const svg = generateSVG(movements)

  fs.mkdirSync('dist', { recursive: true })
  fs.writeFileSync('dist/chess.svg', svg, 'utf-8')
  console.log('✅ chess.svg generated in /dist/')
}

run()


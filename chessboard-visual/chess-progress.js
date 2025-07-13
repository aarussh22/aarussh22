import fs from 'fs';
import fetch from 'node-fetch';

const STATE_FILE = 'chessboard-visual/chess-progress.json';
const SVG_FILE = 'chessboard-visual/chessboard.svg';

const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const getYesterdayDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

const fetchGitHubActivity = async (username, date) => {
  const res = await fetch(`https://api.github.com/users/${username}/events`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
  });
  const data = await res.json();

  return data.some(event =>
    event.created_at.startsWith(date) &&
    ['PushEvent', 'PullRequestEvent', 'IssuesEvent'].includes(event.type)
  );
};

const updateBoard = async () => {
  if (!fs.existsSync(STATE_FILE)) {
    console.error('Missing progress file.');
    return;
  }

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  const i = state.currentPawnIndex;
  const date = getYesterdayDate();
  const wasActive = await fetchGitHubActivity(GITHUB_USERNAME, date);

  if (state.queens[i]) return; // Skip if somehow already promoted

  if (wasActive) {
    if (state.positions[i] < 7) {
      state.positions[i]++;
    } else {
      // Promote to queen and move to next pawn
      state.queens[i] = true;
      state.currentPawnIndex++;
    }
  } else {
    if (state.positions[i] === 7) {
      // Missed promotion
      state.positions[i] = 0;
    }
  }

  // Board completed
  if (state.queens.every(q => q)) {
    state.boardsCompleted++;
    state.positions = Array(8).fill(0);
    state.queens = Array(8).fill(false);
    state.currentPawnIndex = 0;
  }

  state.lastCheckedDate = date;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  fs.writeFileSync(SVG_FILE, generateSVG(state));
};

const generateSVG = (state) => {
  const size = 45;
  let svg = `<svg width="${size * 8}" height="${size * 8 + 40}" xmlns="http://www.w3.org/2000/svg">`;

  // Draw board
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const color = (x + y) % 2 === 0 ? '#f0d9b5' : '#b58863';
      svg += `<rect x="${x * size}" y="${y * size}" width="${size}" height="${size}" fill="${color}"/>`;
    }
  }

  // Draw pieces
  for (let i = 0; i < 8; i++) {
    const x = state.queens[i] ? 7 : state.positions[i];
    const piece = state.queens[i] ? '♛' : '♟';
    svg += `<text x="${x * size + size / 2}" y="${i * size + 30}" font-size="24" text-anchor="middle">${piece}</text>`;
  }

  // Scoreboard
  svg += `<text x="${(size * 8) / 2}" y="${size * 8 + 30}" font-size="14" text-anchor="middle">
    Boards Completed: ${state.boardsCompleted}
  </text>`;

  svg += '</svg>';
  return svg;
};

updateBoard();

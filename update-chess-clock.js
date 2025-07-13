import fs from 'fs';
import fetch from 'node-fetch';

const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const CLOCK_FILE = '.chess-clock.json';
const STATUS_FILE = 'CLOCK_STATUS.md';

const DAY_MINUTES = {
  ACTIVE: 5,
  INACTIVE: 10
};

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
    ['PushEvent', 'IssuesEvent', 'PullRequestEvent'].includes(event.type)
  );
};

const generateProgressBar = (minutesLeft) => {
  const percent = Math.floor((minutesLeft / 60) * 100);
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return '🟩'.repeat(filled) + '⬜️'.repeat(empty) + ` (${percent}%)`;
};

const updateClock = async () => {
  if (!fs.existsSync(CLOCK_FILE)) {
    console.error('No chess clock file found!');
    return;
  }

  const clock = JSON.parse(fs.readFileSync(CLOCK_FILE, 'utf-8'));
  const yesterday = getYesterdayDate();

  const wasActive = await fetchGitHubActivity(GITHUB_USERNAME, yesterday);
  const tick = wasActive ? DAY_MINUTES.ACTIVE : DAY_MINUTES.INACTIVE;

  clock.minutesLeft -= tick;
  clock.lastDateChecked = yesterday;

  let message = '';
  if (clock.minutesLeft <= 0) {
    clock.minutesLeft = 60;
    message = `♟️ Chess clock expired! Starting new game.`;
  } else if (wasActive) {
    message = `🕒 Active yesterday! Moved piece. ${tick} minutes elapsed. ${clock.minutesLeft} mins remain.`;
  } else {
    message = `⏳ No move made yesterday. Idle penalty: ${tick} mins. ${clock.minutesLeft} mins remain.`;
  }

  // Write log
  fs.writeFileSync(CLOCK_FILE, JSON.stringify(clock, null, 2));
  fs.writeFileSync('auto_commit_log.txt', message);

  // Write Markdown dashboard
  const bar = generateProgressBar(clock.minutesLeft);

  const mdStatus = `
## ♟️ Chess Clock Status

- ⏱️ **Time Left:** ${clock.minutesLeft} minutes
- 📅 **Last Checked:** ${clock.lastDateChecked}
- 📝 **Status:** ${message}
- ⏳ **Clock Progress:** ${bar}

---

_Updated automatically via [Chess Clock GitHub Action](https://github.com/${GITHUB_USERNAME}/${GITHUB_USERNAME}/actions)_
  `.trim();

  fs.writeFileSync(STATUS_FILE, mdStatus);
};

updateClock();

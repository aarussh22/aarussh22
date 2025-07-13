import fs from 'fs';
import fetch from 'node-fetch';

const CLOCK_FILE = 'chess-clock/clock.json';
const LOG_FILE = 'chess-clock/auto_commit_log.txt';

const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

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
    ['PushEvent', 'PullRequestEvent', 'IssuesEvent'].includes(event.type)
  );
};

const updateClock = async () => {
  if (!fs.existsSync(CLOCK_FILE)) {
    console.error('Missing clock.json');
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
    message = `♟️ Clock expired! New game started on ${yesterday}`;
  } else if (wasActive) {
    message = `✅ Active on ${yesterday}: -${tick} mins. ${clock.minutesLeft} mins left.`;
  } else {
    message = `❌ Inactive on ${yesterday}: -${tick} mins. ${clock.minutesLeft} mins left.`;
  }

  fs.writeFileSync(CLOCK_FILE, JSON.stringify(clock, null, 2));
  fs.writeFileSync(LOG_FILE, message);
  console.log(message);
};

updateClock();

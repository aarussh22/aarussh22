// utils/github-api.js
import fetch from 'node-fetch'

export async function getContributionData(username) {
  const query = `
    query {
      user(login: "${username}") {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  })

  const json = await res.json()
  const days = json.data.user.contributionsCollection.contributionCalendar.weeks.flatMap(w => w.contributionDays)

  return days
}


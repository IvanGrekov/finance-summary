# finance-summary

## Automated weekly financial overview
A scheduled GPT-based summarizer that runs weekly to generate financial market summaries. Can be run locally, via hosted schedulers, or using GitHub Actions (recommended).

### Data sources
- UA market: https://icu.ua/research/market-reviews
- US market: https://www.blackrock.com/us/individual/insights/blackrock-investment-institute/weekly-commentary
- Global overview: https://www.ib.barclays/our-insights/weekly-insights.html
- EU market (conditional): https://www.ecb.europa.eu/press/economic-bulletin/html/index.en.html
  - Only include this source if the Saturday run date is the 15th day of the month or later **and** that month is the first month of a quarter (January/April/July/October).

### Scheduling and flow
1. **Scheduler**: 
   - **GitHub Actions** (recommended): Configured to run every Saturday at 10:00 AM UTC via `.github/workflows/weekly-summary.yml`
   - **Alternative**: Configure a hosted cron (Workers Cron, Pipedream task, Apps Script trigger) for `11:00` every Saturday.
2. **Job logic** (implemented in `weekly_summary.ts`):
   - Check if the run date meets the EU bulletin rule before adding the ECB link.
   - Build a prompt that **includes the URLs explicitly** and instructs the model to browse each page for the newest weekly issue.
   - Use a model with thinking, browsing, and reasoning enabled (defaults to `gpt-5.1`, override via `OPENAI_MODEL`).
   - Response format: bullet list grouped into sections — main insights/news, warnings/cautions, threats, forecasts.
3. **Telegram delivery**: Sends the summary to Telegram via bot API (requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`).
4. **Repo storage**: After a successful run, the script saves a new Markdown file (e.g., `summaries/YYYY-MM-DD.md`) and GitHub Actions commits it to the repository.

### Sample prompt payload
Provide the URLs directly in the message body and instruct the model to browse:
```
You are preparing a weekly financial overview. Today is <RUN_DATE>. Browse the following sources and use the latest available issue for each:
- UA market: https://icu.ua/research/market-reviews
- US market: https://www.blackrock.com/us/individual/insights/blackrock-investment-institute/weekly-commentary
- Global overview: https://www.ib.barclays/our-insights/weekly-insights.html
- EU market (only if today is the 15th or later of Jan/Apr/Jul/Oct): https://www.ecb.europa.eu/press/economic-bulletin/html/index.en.html

Return a bullet list grouped under these headings: main insights / news; warnings / cautions; threats; forecasts. Focus only on the latest weekly materials from each source.
```

## Setup

### GitHub Actions Setup (Recommended)

1. **Configure GitHub Secrets**:
   - Go to your repository → Settings → Secrets and variables → Actions
   - Add the following secrets:
     - `OPENAI_API_KEY`: Your OpenAI API key
     - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token (create a bot via [@BotFather](https://t.me/botfather))
     - `TELEGRAM_CHAT_ID`: Your Telegram chat ID (can be your user ID or a group chat ID)
     - `OPENAI_MODEL`: (Optional) Model name, defaults to `gpt-5.1` if not set

2. **Configure Workflow Permissions**:
   - Go to Settings → Actions → General → Workflow permissions
   - Select "Read and write permissions"
   - Check "Allow GitHub Actions to create and approve pull requests"

3. **Schedule**:
   - The workflow runs every Saturday at 10:00 AM UTC (cron: `0 10 * * 6`)
   - To change the schedule, edit `.github/workflows/weekly-summary.yml` and modify the cron expression
   - You can also manually trigger the workflow from the Actions tab

4. **Verify Schedule**:
   - **Important**: GitHub Actions doesn't show scheduled runs BEFORE they execute - the clock icon only appears AFTER a scheduled run completes
   - To verify the schedule is active:
     - Check that `.github/workflows/weekly-summary.yml` exists on your default branch (`master`)
     - Verify the cron expression is correct: `0 10 * * 6` (every Saturday at 10:00 AM UTC)
     - Wait until Saturday - if it runs automatically, you'll see a clock icon (🕐) next to that run
   - **Requirements for scheduled workflows**:
     - The workflow file must be on the default branch
     - Your repository must have had activity (commits, PRs, etc.) in the last 60 days
     - To ensure it keeps running, make occasional commits or enable "Keep workflows active" in repository settings
   - **Testing**: You can manually trigger the workflow anytime using "Run workflow" button to test it works

### Running Locally

The automation is implemented in TypeScript (`weekly_summary.ts`). It:

- Computes the correct source list (adds the ECB bulletin only when the run date is on or after the 15th day of Jan/Apr/Jul/Oct).
- Sends a browsing-enabled prompt to OpenAI via the Responses API.
- Saves the response to `summaries/YYYY-MM-DD.md`.
- Sends the summary to Telegram.

**Environment variables**:

| Name | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | API key for OpenAI requests. |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token for sending messages. |
| `TELEGRAM_CHAT_ID` | Yes | Telegram chat ID to receive messages. |
| `OPENAI_MODEL` | No | Model name (defaults to `gpt-5.1`). |

**Usage example**:

```bash
npm install
cp .env.example .env  # Create .env file with your variables
npm run summary
```

### Implementation Tips
- Store secrets in GitHub Secrets (for Actions) or your scheduler's secret store; never hardcode them.
- The workflow automatically commits generated summaries to the repository.
- Monitor workflow runs in the Actions tab to ensure they complete successfully.

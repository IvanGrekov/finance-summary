# finance-summary

## Automated weekly financial overview (no GitHub Actions)
You can run a scheduled GPT-based summarizer every Saturday at 11:00 a.m. without hosting your own VPS and without using GitHub Actions. Use a hosted scheduler (e.g., Cloudflare Workers Cron Triggers, Pipedream/Make, or Google Apps Script time triggers) to invoke the OpenAI API with browsing-enabled models, then store results both in your existing GPT chat and as a committed Markdown file on `master`.

### Data sources
- UA market: https://icu.ua/research/market-reviews
- US market: https://www.blackrock.com/us/individual/insights/blackrock-investment-institute/weekly-commentary
- Global overview: https://www.ib.barclays/our-insights/weekly-insights.html
- EU market (conditional): https://www.ecb.europa.eu/press/economic-bulletin/html/index.en.html
  - Only include this source if the Saturday run date is the 15th day of the month or later **and** that month is the first month of a quarter (January/April/July/October).

### Scheduling and flow
1. **Scheduler**: Configure a hosted cron (Workers Cron, Pipedream task, Apps Script trigger) for `11:00` every Saturday.
2. **Job logic**:
   - Check if the run date meets the EU bulletin rule before adding the ECB link.
   - Build a prompt that **includes the URLs explicitly** (no fetching via GitHub Actions) and instructs the model to browse each page for the latest issue.
   - Use a model with thinking, browsing, and reasoning enabled.
   - Response format: bullet list grouped into four sections — main insights/news, warnings/cautions, threats, forecasts.
3. **Chat delivery**: Call the Assistants/Conversations API to append the response to your existing chat thread at `https://chatgpt.com/g/g-p-693d570a41308191b7a13f944f26dca7-finansi/c/693d57e1-80c4-8326-ad9f-143c87300526` so you can open it later and ask follow-ups.
4. **Repo storage**: After a successful run, commit a new Markdown file (e.g., `summaries/YYYY-MM-DD.md`) with the same bullet list to the `master` branch so the history is preserved.

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

### Implementation tips
- Store secrets (OpenAI API key, chat/thread ID, repo token) in the scheduler’s secret store; never hardcode them.
- If using a platform like Pipedream/Make, add a Git push step after the API call to commit the Markdown summary into `master`.
- Log failures to an email/Slack/monitoring webhook so you know if a Saturday run breaks.

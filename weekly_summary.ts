import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import OpenAI from "openai";

const UA_MARKET_URL = "https://icu.ua/research/market-reviews";
const US_MARKET_URL =
  "https://www.blackrock.com/us/individual/insights/blackrock-investment-institute/weekly-commentary";
const GLOBAL_MARKET_URL = "https://www.ib.barclays/our-insights/weekly-insights.html";
const ECB_MARKET_URL =
  "https://www.ecb.europa.eu/press/economic-bulletin/html/index.en.html";

const QUARTER_START_MONTHS = new Set([1, 4, 7, 10]);

interface Source {
  name: string;
  url: string;
}

function formatDate(runDate: Date): string {
  return runDate.toISOString().slice(0, 10);
}

function shouldIncludeEcb(runDate: Date): boolean {
  const month = runDate.getMonth() + 1; // months are zero-based
  return runDate.getDate() >= 15 && QUARTER_START_MONTHS.has(month);
}

function buildSources(runDate: Date): Source[] {
  const sources: Source[] = [
    { name: "UA market", url: UA_MARKET_URL },
    { name: "US market", url: US_MARKET_URL },
    { name: "Global overview", url: GLOBAL_MARKET_URL },
  ];

  if (shouldIncludeEcb(runDate)) {
    sources.push({ name: "EU market", url: ECB_MARKET_URL });
  }

  return sources;
}

function buildPrompt(runDate: Date, sources: Source[]): string {
  const lines: string[] = [
    "You are preparing a weekly financial overview.",
    `Today is ${formatDate(runDate)} (Saturday run).`,
    "Browse each source below for its latest weekly issue and summarize findings.",
    "Use thinking/reasoning to produce concise, bullet-listed highlights.",
    "Sources:",
  ];

  for (const source of sources) {
    lines.push(`- ${source.name}: ${source.url}`);
  }

  lines.push(
    "",
    "Return a bullet list grouped under these headings (in order):",
    "main insights / news; warnings / cautions; threats; forecasts.",
    "Use only the most recent weekly materials from each source."
  );

  return lines.join("\n");
}

async function runSummaryRequest(
  client: OpenAI,
  model: string,
  prompt: string
): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: "You summarize financial markets." },
      { role: "user", content: prompt },
    ],
  });

  return response.choices[0].message.content ?? "";
}

async function appendToThread(
  client: OpenAI,
  threadId: string,
  content: string
): Promise<void> {
  await client.beta.threads.messages.create(threadId, {
    role: "assistant",
    content,
  });
}

function writeMarkdown(runDate: Date, content: string): string {
  const targetDir = path.join(process.cwd(), "summaries");
  mkdirSync(targetDir, { recursive: true });

  const outputPath = path.join(targetDir, `${formatDate(runDate)}.md`);
  const header = `# Weekly financial overview (${formatDate(runDate)})\n\n`;
  writeFileSync(outputPath, header + content + "\n", { encoding: "utf8" });

  return outputPath;
}

function gitCommit(filePath: string, runDate: Date): void {
  execSync(`git add ${JSON.stringify(filePath)}`, { stdio: "inherit" });
  execSync(`git commit -m ${JSON.stringify(`Add weekly summary for ${formatDate(runDate)}`)}`, {
    stdio: "inherit",
  });
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const model = process.env.OPENAI_MODEL ?? "o1-preview";
  const threadId = process.env.CHAT_THREAD_ID;
  const runDate = new Date();

  const client = new OpenAI({ apiKey });

  const sources = buildSources(runDate);
  const prompt = buildPrompt(runDate, sources);
  const summary = await runSummaryRequest(client, model, prompt);

  const outputPath = writeMarkdown(runDate, summary);

  if (threadId && summary.trim().length > 0) {
    await appendToThread(client, threadId, summary);
  }

  gitCommit(outputPath, runDate);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

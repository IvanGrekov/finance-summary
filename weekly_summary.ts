import "dotenv/config";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import OpenAI from "openai";
import https from "https";

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
  return runDate.getDate() >= 14 && QUARTER_START_MONTHS.has(month);
}

function buildSources(): Source[] {
  const runDate = new Date();
  const sources: Source[] = [
    { name: "Український ринок", url: UA_MARKET_URL },
    { name: "Американський ринок", url: US_MARKET_URL },
    { name: "Короткий огляд глобального ринку", url: GLOBAL_MARKET_URL },
  ];

  if (shouldIncludeEcb(runDate)) {
    sources.push({ name: "Європейський ринок, квартальний огляд", url: ECB_MARKET_URL });
  }

  return sources;
}

function buildSystemPrompt(): string {
  const lines: string[] = [
    "Ти фінансовий аналітик. ",
    "Пиши чіткі, структуровані огляди українською мовою у форматі bullet list. ",
    "Використовуй простий, зрозумілий для читача текст, без перевантаження спеціальними термінами та аббревіатурами. Без всяких EM, UST, IG gilts, DM, тощо. Роби текст зрозумілим для читача не з фінансового сектору. ",
    "Секції: 'Головні події', 'Основні загрози / ризики', 'Ключові прогнози'.",
    "Якщо є трохи цифр, будь ласка вкажи їх також, але не вигадуй нічого від себе. Не змінюй цифри, лише показуй їх. ",
  ];

  return lines.join("\n");
}

function buildUserPrompt(sources: Source[]): string {
  const lines: string[] = [
    "Знайди на цих джерелах: ",
    sources.map((source) => `- ${source.name}: ${source.url}`).join("\n"),
    "найактуальніші фінансові звіти ",
    "найактуальніший щотижневий фінансовий звіт (Financial Weekly / Фінансовий тижневик) " +
    "і зроби по ньому короткий звіт у вказаному форматі: " +
    "Україна: ОВДП, євробонди, валютний ринок, стан економіки; ",
    "США: облігації, акції, стан економіки; ",
    "Європа: облігації, акції, стан економіки; ",
    "Світ: облігації, акції, стан економіки; ",
    "Інвестування з позиції українця, який хоче зберегти свої заощадження та хоче помірного зростання портфелю без ризиків, на 8%-12% річних, з диверсифікацією: облігації, акції, криптовалюти, реальний сектор, нерухомість."
  ];

  return lines.join("\n");
}

async function runSummaryRequest({
  client,
  model,
  systemPrompt,
  userPrompt,
}: {
  client: OpenAI;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
const response = await client.responses.create({
  model,
  reasoning: { effort: "high" },
  // @ts-ignore
  tools: [{ type: "web_search" }],
  tool_choice: "auto",
  input: [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: userPrompt,
    },
  ],
});

  return response.output_text ?? "";
}

function writeMarkdown(content: string): string {
  const targetDir = path.join(process.cwd(), "summaries");
  mkdirSync(targetDir, { recursive: true });

  const outputPath = path.join(targetDir, `${formatDate(new Date())}.md`);
  writeFileSync(outputPath, content + "\n", { encoding: "utf8" });

  return outputPath;
}

function gitCommit(filePath: string): void {
  execSync(`git add ${JSON.stringify(filePath)}`, { stdio: "inherit" });
  execSync(`git commit -m ${JSON.stringify(`Add weekly summary for ${formatDate(new Date())}`)}`, {
    stdio: "inherit",
  });
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-5.1";

  const client = new OpenAI({ apiKey });

  const sources = buildSources();
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(sources);
  const summary = await runSummaryRequest({client, model, systemPrompt, userPrompt});
  const outputPath = writeMarkdown(summary);

  // gitCommit(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

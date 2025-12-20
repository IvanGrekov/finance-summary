import "dotenv/config";
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

function formatDate(runDate: Date): string {
  return runDate.toISOString().slice(0, 10);
}

function shouldIncludeEcb(runDate: Date): boolean {
  const month = runDate.getMonth() + 1; // months are zero-based
  return runDate.getDate() >= 14 && QUARTER_START_MONTHS.has(month);
}

interface Source {
  name: string;
  url: string;
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
    `найактуальніші фінансові звіти станом на сьогодні, ${formatDate(new Date())}.`,
    "найактуальніший щотижневий фінансовий звіт (Financial Weekly / Фінансовий тижневик) " +
    "і зроби по ньому короткий звіт у вказаному форматі: " +
    "Україна: ОВДП, євробонди, валютний ринок, стан економіки; ",
    "США: облігації, акції, стан економіки; ",
    "Європа: облігації, акції, стан економіки; ",
    "Світ: облігації, акції, стан економіки; ",
    "На основі цього огляду звітів, чи потрібні якісь зміни щодо стратегії помірно-консервативного інвестування з позиції українця, який хоче зберегти свої заощадження та хоче помірного зростання портфелю без ризиків, на 8%-12% річних у доларах / євро, з диверсифікацією: облігації, акції, криптовалюти, реальний сектор, нерухомість."
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

interface SendTelegramMessageArgs {
  text: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
}

async function sendTelegramMessage({
  text,
  parse_mode,
  disable_web_page_preview,
  disable_notification,
}: SendTelegramMessageArgs): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN environment variable is required.");
  }

  if (!chatId) {
    throw new Error("TELEGRAM_CHAT_ID environment variable is required.");
  }

  // Telegram API limit: 4096 characters per message
  if (text.length > 4096) {
    throw new Error(`Message too long (${text.length} characters). Telegram limit is 4096 characters. Split into multiple messages.`);
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode,
    disable_web_page_preview,
    disable_notification,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      const errorMessage = data.description || `HTTP ${response.status}`;
      throw new Error(`Telegram API error: ${errorMessage}`);
    }

    return;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to send Telegram message: ${error.message}`);
    }
    throw error;
  }
}

export async function sendTelegramMessageLong({
  text,
  parse_mode,
  disable_web_page_preview,
  disable_notification,
}: SendTelegramMessageArgs): Promise<void> {
  const MAX_LENGTH = 4000;
  const MAIN_SEPARATOR = "##";
  const SUB_SEPARATOR = "###";
  
  // If the text is short enough, send it as a single message
  if (text.length <= MAX_LENGTH) {
    return sendTelegramMessage({ text, parse_mode, disable_web_page_preview, disable_notification });
  }

  // Split by newlines first to keep paragraphs together
  const parts: string[] = [];
  const textLines = text.split(MAIN_SEPARATOR);
  let currentPart = "";


  for (const line of textLines) {
    if (currentPart.length + line.length < MAX_LENGTH) {
      currentPart += (currentPart ? MAIN_SEPARATOR : "") + line;
    } else {
      // If the current part is not empty, add it to the parts array
      if (currentPart) {
        parts.push(currentPart);
        currentPart = "";
      }

      if (line.length > MAX_LENGTH) {
        const lineSentences = line.split(SUB_SEPARATOR);
        let text = ""
        for (const sentence of lineSentences) {
          if (text.length + sentence.length < MAX_LENGTH) {
            text += sentence + SUB_SEPARATOR;
          } else {
            parts.push(text);
            text = sentence + SUB_SEPARATOR;
          }
        }
      } else {
        parts.push(line);
      }
    }
  }

  if (currentPart) {
    parts.push(currentPart);
  }

  // Send all parts sequentially
  for (let i = 0; i < parts.length; i++) {    
    const partText = parts.length > 1 
      ? `[Part ${i + 1}/${parts.length}]\n\n${parts[i]}`
      : parts[i];
    
    await sendTelegramMessage({ text: partText, parse_mode, disable_web_page_preview, disable_notification });
    
    // Small delay between messages to avoid rate limiting
    if (i < parts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
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
  writeMarkdown(summary);

  await sendTelegramMessageLong({
    text: summary,
    parse_mode: "Markdown",
    disable_web_page_preview: false,
    disable_notification: false,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

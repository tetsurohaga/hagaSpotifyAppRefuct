// Claude API による解説生成（既存 Perplexity 連携の置換）。
// モデルは claude-opus-4-8、adaptive thinking。Markdown 文字列を返す。
// Web 検索ツール（web_search_20260209）は CLAUDE_WEB_SEARCH=true で有効化（フェーズ4）。
// サーバサイドツール使用時は stop_reason === "pause_turn" のループに対応する。

import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL, CLAUDE_WEB_SEARCH } from "../config.js";
import { getClaudeApiKey } from "./secrets.js";
import { SYSTEM_PROMPT, ARTIST_PROMPT } from "../prompts/artistPrompt.js";

let client: Anthropic | null = null;
async function getClient(): Promise<Anthropic> {
  if (client) return client;
  client = new Anthropic({ apiKey: await getClaudeApiKey() });
  return client;
}

// 返却メッセージから text ブロックを連結する。
function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** アーティスト解説（Markdown）を生成して返す。 */
export async function generateBiography(artistName: string): Promise<string> {
  const anthropic = await getClient();

  const tools = CLAUDE_WEB_SEARCH
    ? ([{ type: "web_search_20260209", name: "web_search" }] as unknown as Anthropic.Messages.ToolUnion[])
    : undefined;

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: `アーティスト '${artistName}' について、以下の指示に従って情報を提供してください：\n\n${ARTIST_PROMPT}`,
    },
  ];

  // Web 検索ツール使用時は pause_turn で応答を継続するループ。
  // ツール未使用時は 1 回で完了する。
  let text = "";
  for (let i = 0; i < 6; i++) {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" } as unknown as Anthropic.Messages.ThinkingConfigParam,
      system: SYSTEM_PROMPT,
      ...(tools ? { tools } : {}),
      messages,
    });

    text = extractText(res.content);

    if ((res.stop_reason as string) === "pause_turn") {
      // アシスタントの途中応答をそのまま積んで継続させる。
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    break;
  }

  return text;
}

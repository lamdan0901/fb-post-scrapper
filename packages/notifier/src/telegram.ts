// ── Telegram Bot API Client ──

export interface TelegramNotifierConfig {
  /** Telegram Bot API token (from @BotFather). */
  botToken: string;
  /** Default chat ID used when sendMessage is called without an explicit chatId. */
  defaultChatId: string;
}

export class TelegramNotifier {
  private readonly baseUrl: string;
  private readonly defaultChatId: string;

  constructor(config: TelegramNotifierConfig) {
    if (!config.botToken?.trim()) {
      throw new Error("TelegramNotifierConfig: botToken is required");
    }
    if (!config.defaultChatId?.trim()) {
      throw new Error("TelegramNotifierConfig: defaultChatId is required");
    }
    this.baseUrl = `https://api.telegram.org/bot${config.botToken}`;
    this.defaultChatId = config.defaultChatId;
  }

  /**
   * Send a message via Telegram Bot API.
   *
   * Overloads:
   * - `sendMessage(text)` — sends to the default chat ID
   * - `sendMessage(chatId, text)` — sends to the specified chat ID
   *
   * Uses `parse_mode: "HTML"`. Callers are responsible for escaping
   * HTML entities in dynamic content (`&`, `<`, `>`).
   *
   * Never throws — errors are logged and swallowed so downstream
   * callers (e.g. the scraper orchestrator's `alertFn`) are not disrupted.
   */
  async sendMessage(textOrChatId: string, text?: string): Promise<void> {
    const chatId = text !== undefined ? textOrChatId : this.defaultChatId;
    const body = text !== undefined ? text : textOrChatId;

    try {
      const htmlRes = await this.postMessage(chatId, body, "HTML");
      if (htmlRes.ok) {
        return;
      }

      // Fall back to plain text when Telegram rejects HTML parsing.
      if (htmlRes.error.includes("can't parse entities")) {
        const plain = this.toPlainText(body);
        const plainRes = await this.postMessage(chatId, plain);
        if (plainRes.ok) {
          console.warn(
            "[TelegramNotifier] HTML parse failed; sent notification as plain text instead",
          );
          return;
        }

        console.error(
          `[TelegramNotifier] Plain-text fallback failed: ${plainRes.error}`,
        );
        return;
      }

      console.error(
        `[TelegramNotifier] Failed to send message: ${htmlRes.error}`,
      );
    } catch (err) {
      console.error(
        `[TelegramNotifier] Failed to send message (chatId=${chatId}, textLength=${body.length}):`,
        err,
      );
    }
  }

  private async postMessage(
    chatId: string,
    text: string,
    parseMode?: "HTML",
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const payload: { chat_id: string; text: string; parse_mode?: "HTML" } = {
      chat_id: chatId,
      text,
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }

    const res = await fetch(`${this.baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "<unreadable>");
      return { ok: false, error: `API ${res.status}: ${errorBody}` };
    }

    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) {
      return {
        ok: false,
        error: json.description ?? "Telegram responded with ok=false",
      };
    }

    return { ok: true };
  }

  private toPlainText(htmlMessage: string): string {
    return htmlMessage
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }
}

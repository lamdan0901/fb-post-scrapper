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
      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: body,
          parse_mode: "HTML",
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "<unreadable>");
        console.error(
          `[TelegramNotifier] API error ${res.status}: ${errorBody}`,
        );
        return;
      }

      const json = (await res.json()) as { ok: boolean; description?: string };
      if (!json.ok) {
        console.error(
          `[TelegramNotifier] Telegram responded with ok=false: ${json.description ?? "unknown error"}`,
        );
      }
    } catch (err) {
      console.error(
        `[TelegramNotifier] Failed to send message (chatId=${chatId}, textLength=${body.length}):`,
        err,
      );
    }
  }
}

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  sessionId?: string;
  level: LogLevel;
  message: string;
  url?: string;
  stack?: string;
  meta?: Record<string, unknown>;
  timestamp: number;
}

type ConsoleFn = (...args: unknown[]) => void;

/**
 * Automatically captures console.info/warn/error output and unhandled errors,
 * then ships them to the backend `/logs/ingest` endpoint.
 *
 * All console methods are restored exactly in `destroy()`.
 */
export class LogCapture {
  private readonly endpoint: string;
  private readonly sessionId: string;
  private readonly authHeaders: Record<string, string>;

  // Original console methods preserved so we can restore them.
  private origInfo!: ConsoleFn;
  private origWarn!: ConsoleFn;
  private origError!: ConsoleFn;

  private prevOnError: OnErrorEventHandler = null;
  private prevOnUnhandledRejection:
    | ((e: PromiseRejectionEvent) => void)
    | null = null;

  private initialized = false;

  constructor(options: {
    endpoint: string;
    sessionId: string;
    secretKey?: string;
  }) {
    // Derive the API base URL by stripping everything from the last path
    // segment that isn't a versioning prefix.  The tracker config `endpoint`
    // is the *events* URL (e.g. http://host/api/events), but logs live at
    // http://host/api/logs/ingest, so we walk up until we reach the common
    // base (i.e. remove the final segment).
    try {
      const u = new URL(options.endpoint);
      // Remove the last non-empty path segment (e.g. "/api/events" → "/api")
      const parts = u.pathname.replace(/\/$/, "").split("/");
      parts.pop();
      u.pathname = parts.join("/") || "/";
      this.endpoint = u.toString().replace(/\/$/, "");
    } catch {
      this.endpoint = options.endpoint;
    }
    this.sessionId = options.sessionId;
    this.authHeaders = options.secretKey
      ? { Authorization: `Bearer ${options.secretKey}` }
      : {};
  }

  init(): void {
    if (typeof window === "undefined" || this.initialized) return;

    this.origInfo = console.info.bind(console);
    this.origWarn = console.warn.bind(console);
    this.origError = console.error.bind(console);

    console.info = (...args: unknown[]) => {
      this.origInfo(...args);
      this.send("info", this.format(args));
    };

    console.warn = (...args: unknown[]) => {
      this.origWarn(...args);
      this.send("warn", this.format(args));
    };

    console.error = (...args: unknown[]) => {
      this.origError(...args);
      const [first] = args;
      const stack = first instanceof Error ? first.stack : undefined;
      this.send("error", this.format(args), { stack });
    };

    this.prevOnError = window.onerror;
    window.onerror = (msg, src, line, col, err) => {
      this.send("error", String(msg), {
        stack: err?.stack,
        meta: { src, line, col },
      });
      if (typeof this.prevOnError === "function") {
        return this.prevOnError(msg, src, line, col, err);
      }
      return false;
    };

    this.prevOnUnhandledRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : String(reason ?? "Unhandled promise rejection");
      this.send("error", message, {
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };
    window.addEventListener(
      "unhandledrejection",
      this.prevOnUnhandledRejection,
    );

    this.initialized = true;
  }

  destroy(): void {
    if (!this.initialized) return;
    console.info = this.origInfo;
    console.warn = this.origWarn;
    console.error = this.origError;

    window.onerror = this.prevOnError;
    if (this.prevOnUnhandledRejection) {
      window.removeEventListener(
        "unhandledrejection",
        this.prevOnUnhandledRejection,
      );
    }
    this.initialized = false;
  }

  /** Manually capture a log entry (e.g. from try/catch). */
  capture(
    level: LogLevel,
    message: string,
    extra?: { stack?: string; meta?: Record<string, unknown> },
  ): void {
    this.send(level, message, extra);
  }

  private format(args: unknown[]): string {
    return args
      .map((a) => {
        if (a instanceof Error) return a.message;
        if (typeof a === "object") {
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(" ");
  }

  private send(
    level: LogLevel,
    message: string,
    extra?: { stack?: string; meta?: Record<string, unknown> },
  ): void {
    const entry: LogEntry = {
      sessionId: this.sessionId,
      level,
      message,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      stack: extra?.stack,
      meta: extra?.meta,
      timestamp: Date.now(),
    };
    const url = `${this.endpoint}/logs/ingest`;
    const body = JSON.stringify(entry);

    // Use fetch with keepalive so the request survives page navigation.
    // Errors are logged to the (original, unpatched) console so they are
    // visible in DevTools without creating an infinite log loop.
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders },
      body,
      keepalive: true,
    }).catch((err: unknown) => {
      // Use the original (pre-patch) error logger to avoid recursion.
      if (this.origError) {
        this.origError("[user-tracker] Failed to send log:", err);
      }
    });
  }
}

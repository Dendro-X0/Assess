import "./style.css";

const STORAGE_KEY = "assess_api_key";

const apiBase = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_URL ?? "http://localhost:8787");

const signupButton = document.querySelector<HTMLButtonElement>("#signup-btn");
const keyResult = document.querySelector<HTMLDivElement>("#key-result");
const errorEl = document.querySelector<HTMLParagraphElement>("#signup-error");
const polarLink = document.querySelector<HTMLAnchorElement>("#polar-link");
const assessButton = document.querySelector<HTMLButtonElement>("#assess-btn");
const issueUrlInput = document.querySelector<HTMLInputElement>("#issue-url");
const assessError = document.querySelector<HTMLParagraphElement>("#assess-error");
const assessResult = document.querySelector<HTMLDivElement>("#assess-result");

if (polarLink) {
  const checkout = import.meta.env.VITE_POLAR_CHECKOUT_URL;
  if (checkout) {
    polarLink.href = checkout;
  } else {
    polarLink.classList.add("muted");
    polarLink.textContent = "Pro checkout (coming soon)";
    polarLink.removeAttribute("href");
  }
}

function getStoredKey(): string | null {
  return sessionStorage.getItem(STORAGE_KEY);
}

function storeKey(key: string) {
  sessionStorage.setItem(STORAGE_KEY, key);
}

function restoreKeyBanner() {
  const key = getStoredKey();
  if (!key || !keyResult) return;

  keyResult.innerHTML = `
    <strong>API key saved for this session:</strong><br>
    <code>${key}</code><br>
    <span class="muted">Use Try it below, or copy for curl/scripts.</span>
  `;
  keyResult.classList.add("visible");
}

restoreKeyBanner();

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const preview = text.slice(0, 80).replace(/\s+/g, " ").trim();
    throw new Error(
      `API returned a non-JSON response (${response.status}). ` +
        `Is the API server running? ${preview ? `Body: ${preview}` : ""}`,
    );
  }
}

function networkErrorMessage() {
  return "Cannot reach the API server. Run `pnpm dev` or `pnpm dev:all` in the assess-api repo.";
}

signupButton?.addEventListener("click", async () => {
  if (!signupButton || !keyResult || !errorEl) return;

  signupButton.disabled = true;
  errorEl.textContent = "";
  keyResult.classList.remove("visible");

  try {
    const response = await fetch(`${apiBase}/v1/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "docs-signup" }),
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
      const message =
        (typeof data.message === "string" && data.message) ||
        (typeof data.error === "string" && data.error) ||
        `Signup failed (${response.status})`;
      throw new Error(message);
    }

    if (typeof data.key !== "string") {
      throw new Error("API response missing key field");
    }

    storeKey(data.key);

    keyResult.innerHTML = `
      <strong>Your API key (copy now):</strong><br>
      <code>${data.key}</code><br>
      <span class="muted">Plan: ${data.plan} · ${data.monthlyQuota}/mo · ${data.ratePerMinute}/min</span>
    `;
    keyResult.classList.add("visible");
  } catch (error) {
    errorEl.textContent =
      error instanceof TypeError
        ? networkErrorMessage()
        : error instanceof Error
          ? error.message
          : "Signup failed";
  } finally {
    signupButton.disabled = false;
  }
});

assessButton?.addEventListener("click", async () => {
  if (!assessButton || !issueUrlInput || !assessError || !assessResult) return;

  const apiKey = getStoredKey();
  if (!apiKey) {
    assessError.textContent = "Get an API key first (button above).";
    return;
  }

  const url = issueUrlInput.value.trim();
  if (!url) {
    assessError.textContent = "Enter a GitHub issue URL.";
    return;
  }

  assessButton.disabled = true;
  assessError.textContent = "";
  assessResult.classList.remove("visible");

  try {
    const response = await fetch(`${apiBase}/v1/assess`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "opportunity", url }),
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
      const message =
        (typeof data.message === "string" && data.message) ||
        (typeof data.error === "string" && data.error) ||
        `Assess failed (${response.status})`;
      throw new Error(message);
    }

    const verdict = typeof data.verdict === "string" ? data.verdict : "unchecked";
    const score = typeof data.score === "number" ? data.score : "—";
    const reason = typeof data.reason === "string" ? data.reason : null;
    const signals = Array.isArray(data.signals) ? data.signals : [];
    const fired = signals.filter(
      (s): s is { id: string; fired: boolean; summary: string } =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as { id?: unknown }).id === "string",
    );

    const signalItems = fired
      .filter((s) => s.fired)
      .map((s) => `<li class="signal-fired"><strong>${s.id}</strong> — ${s.summary}</li>`)
      .join("");

    assessResult.innerHTML = `
      <p class="verdict verdict-${verdict}">${verdict}</p>
      <p>Score: <strong>${score}</strong>${reason ? ` · ${reason}` : ""}</p>
      ${
        signalItems
          ? `<ul class="signal-list">${signalItems}</ul>`
          : `<p class="muted">No signals fired.</p>`
      }
    `;
    assessResult.classList.add("visible");
  } catch (error) {
    assessError.textContent =
      error instanceof TypeError
        ? networkErrorMessage()
        : error instanceof Error
          ? error.message
          : "Assess failed";
  } finally {
    assessButton.disabled = false;
  }
});

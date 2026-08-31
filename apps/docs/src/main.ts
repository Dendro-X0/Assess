import "./style.css";

const apiBase = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_URL ?? "http://localhost:8787");

const signupButton = document.querySelector<HTMLButtonElement>("#signup-btn");
const keyResult = document.querySelector<HTMLDivElement>("#key-result");
const errorEl = document.querySelector<HTMLParagraphElement>("#signup-error");
const polarLink = document.querySelector<HTMLAnchorElement>("#polar-link");

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

    keyResult.innerHTML = `
      <strong>Your API key (copy now):</strong><br>
      <code>${data.key}</code><br>
      <span class="muted">Plan: ${data.plan} · ${data.monthlyQuota}/mo · ${data.ratePerMinute}/min</span>
    `;
    keyResult.classList.add("visible");
  } catch (error) {
    if (error instanceof TypeError) {
      errorEl.textContent =
        "Cannot reach the API server. Run `pnpm dev` or `pnpm dev:all` in the assess-api repo.";
    } else {
      errorEl.textContent = error instanceof Error ? error.message : "Signup failed";
    }
  } finally {
    signupButton.disabled = false;
  }
});

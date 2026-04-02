import { getSupabaseAdmin } from "@/lib/supabase-server";

const DEFAULT_AUTOCOMPLETE_WINDOW_SECONDS = 60;
const DEFAULT_AUTOCOMPLETE_WINDOW_LIMIT = 15;
const DEFAULT_DESTINATIONS_WINDOW_SECONDS = 60;
const DEFAULT_DESTINATIONS_WINDOW_LIMIT = 4;

function getNumericEnv(name: string, fallback: number) {
  const rawValue = process.env[name];
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function normalizeIpAddress(rawIp: string | null) {
  if (!rawIp) {
    return "unknown";
  }

  return rawIp.trim().split(",")[0]?.trim() || "unknown";
}

export function getRequestIpAddress(headers: Headers) {
  return normalizeIpAddress(
    headers.get("x-forwarded-for") ||
      headers.get("x-real-ip") ||
      headers.get("cf-connecting-ip"),
  );
}

export async function consumeShortWindowRateLimit(input: {
  scope: "autocomplete" | "destinations";
  identifier: string;
}) {
  const supabase = getSupabaseAdmin();
  const windowSeconds =
    input.scope === "autocomplete"
      ? getNumericEnv("GOOGLE_PLACES_AUTOCOMPLETE_WINDOW_SECONDS", DEFAULT_AUTOCOMPLETE_WINDOW_SECONDS)
      : getNumericEnv("GOOGLE_PLACES_DESTINATIONS_WINDOW_SECONDS", DEFAULT_DESTINATIONS_WINDOW_SECONDS);
  const requestLimit =
    input.scope === "autocomplete"
      ? getNumericEnv("GOOGLE_PLACES_AUTOCOMPLETE_WINDOW_LIMIT", DEFAULT_AUTOCOMPLETE_WINDOW_LIMIT)
      : getNumericEnv("GOOGLE_PLACES_DESTINATIONS_WINDOW_LIMIT", DEFAULT_DESTINATIONS_WINDOW_LIMIT);

  const { data, error } = await supabase.rpc("consume_rate_limit", {
    bucket_name: `${input.scope}:${input.identifier}`,
    window_seconds: windowSeconds,
    request_limit: requestLimit,
  });

  if (error) {
    throw new Error(`Failed to enforce rate limit: ${error.message}`);
  }

  if (!data) {
    throw new Error(
      input.scope === "autocomplete"
        ? "Too many place searches right now. Please wait a moment and try again."
        : "Too many destination fetches right now. Please wait a moment and try again.",
    );
  }
}

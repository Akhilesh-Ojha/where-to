import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type DailyUsageRow = {
  service_key: string;
  usage_date?: string;
  request_count: number;
};

async function getCount(table: string) {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(error.message);
  }

  return count || 0;
}

async function getDistinctCount(table: string, column: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from(table).select(column).returns<Record<string, unknown>[]>();

  if (error) {
    throw new Error(error.message);
  }

  return new Set((data || []).map((row) => row[column])).size;
}

async function getDailyUsageTotals() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("api_daily_usage")
    .select("service_key, request_count")
    .returns<DailyUsageRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const totals = (data || []).reduce<Record<string, number>>((acc, row) => {
    acc[row.service_key] = (acc[row.service_key] || 0) + (row.request_count || 0);
    return acc;
  }, {});

  return totals;
}

async function getDailyUsageTotalsForDate(usageDate: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("api_daily_usage")
    .select("service_key, request_count")
    .eq("usage_date", usageDate)
    .returns<DailyUsageRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const totals = (data || []).reduce<Record<string, number>>((acc, row) => {
    acc[row.service_key] = (acc[row.service_key] || 0) + (row.request_count || 0);
    return acc;
  }, {});

  return totals;
}

async function getEventCounts() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("analytics_events")
    .select("event_name");

  if (error) {
    // Table might not exist yet if schema.sql hasn't been applied in Supabase.
    return { counts: null as null | Record<string, number>, error: error.message };
  }

  const counts = (data || []).reduce<Record<string, number>>((acc, row) => {
    const eventName = (row as { event_name?: string }).event_name || "unknown";
    acc[eventName] = (acc[eventName] || 0) + 1;
    return acc;
  }, {});

  return { counts, error: "" };
}

function getNumericEnv(name: string, fallback: number) {
  const rawValue = process.env[name];
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await Promise.resolve(searchParams || {});
  const key = typeof params.key === "string" ? params.key : "";
  const expectedKey = process.env.ANALYTICS_KEY || "";

  if (!expectedKey || key !== expectedKey) {
    notFound();
  }

  const [
    plansTotal,
    participantsTotal,
    votesTotal,
    distinctVoters,
    dailyUsageTotalsAllTime,
    dailyUsageTotalsToday,
    events,
  ] = await Promise.all([
    getCount("plans"),
    getCount("participants"),
    getCount("destination_votes"),
    getDistinctCount("destination_votes", "participant_id"),
    getDailyUsageTotals(),
    getDailyUsageTotalsForDate(new Date().toISOString().slice(0, 10)),
    getEventCounts(),
  ]);

  const autocompleteDailyLimit = getNumericEnv("GOOGLE_PLACES_AUTOCOMPLETE_DAILY_LIMIT", 1000);
  const nearbyDailyLimit = getNumericEnv("GOOGLE_PLACES_NEARBY_DAILY_LIMIT", 1000);
  const photosDailyLimit = getNumericEnv("GOOGLE_PLACES_PHOTOS_DAILY_LIMIT", 1000);

  const autocompleteWindowSeconds = getNumericEnv("GOOGLE_PLACES_AUTOCOMPLETE_WINDOW_SECONDS", 60);
  const autocompleteWindowLimit = getNumericEnv("GOOGLE_PLACES_AUTOCOMPLETE_WINDOW_LIMIT", 15);
  const destinationsWindowSeconds = getNumericEnv("GOOGLE_PLACES_DESTINATIONS_WINDOW_SECONDS", 60);
  const destinationsWindowLimit = getNumericEnv("GOOGLE_PLACES_DESTINATIONS_WINDOW_LIMIT", 4);

  const chaiClicks = events.counts?.support_chai_click || 0;
  const winnerShown = events.counts?.decision_winner_shown || 0;
  const tieShown = events.counts?.decision_tie_shown || 0;
  const todayLocationLookups = dailyUsageTotalsToday.google_places_autocomplete || 0;
  const todayNearbyCalls = dailyUsageTotalsToday.google_places_nearby || 0;
  const todayPhotoCalls = dailyUsageTotalsToday.google_places_photos || 0;
  const todayPostFreeEstimateUsd =
    (todayLocationLookups * 9.6) / 1000 +
    (todayNearbyCalls * 9.6) / 1000 +
    (todayPhotoCalls * 2.1) / 1000;

  return (
    <main className="min-h-screen bg-[#09090c] px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
          <p className="text-[11px] uppercase tracking-[0.38em] text-amber-300/80">Meetfair</p>
          <h1 className="mt-2 text-3xl font-semibold">Analytics</h1>
          <p className="mt-2 text-sm text-white/55">Private dashboard (key-gated).</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Plans created" value={plansTotal} />
            <Metric label="Participants joined" value={participantsTotal} />
            <Metric label="Votes cast" value={votesTotal} />
            <Metric label="Unique voters" value={distinctVoters} />
            <Metric label="Chai clicks" value={chaiClicks} />
            <Metric label="Winner popups" value={winnerShown} />
            <Metric label="Draw popups" value={tieShown} />
          </div>

          {events.counts === null ? (
            <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/8 px-4 py-3 text-sm text-amber-50/85">
              Event tracking table not ready yet: {events.error}. Run the updated `supabase/schema.sql` in Supabase to enable chai click and decision popup analytics.
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
              API Usage Totals (Tracked)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric
                label="Location lookups (today)"
                value={dailyUsageTotalsToday.google_places_autocomplete || 0}
                hint={`Limit: ${autocompleteDailyLimit}/day`}
              />
              <Metric
                label="Places nearby (today)"
                value={dailyUsageTotalsToday.google_places_nearby || 0}
                hint={`Limit: ${nearbyDailyLimit}/day`}
              />
              <Metric
                label="Location lookups (all-time)"
                value={dailyUsageTotalsAllTime.google_places_autocomplete || 0}
              />
              <Metric
                label="Places nearby (all-time)"
                value={dailyUsageTotalsAllTime.google_places_nearby || 0}
              />
              <Metric
                label="Places photos (today)"
                value={dailyUsageTotalsToday.google_places_photos || 0}
                hint={`Limit: ${photosDailyLimit}/day`}
              />
              <Metric
                label="Places photos (all-time)"
                value={dailyUsageTotalsAllTime.google_places_photos || 0}
              />
            </div>
            <p className="text-sm text-white/50">
              India pricing assumptions: location lookup and destination search are both estimated against Places Text Search pricing right now, because the current code still uses `places:searchText` for both flows.
            </p>
          </div>

          <div className="mt-4 grid gap-3 rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
              India Pricing Assumptions
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric
                label="Location lookup"
                value="35k free / mo"
                hint="$9.60 / 1,000 after free tier"
              />
              <Metric
                label="Destination search"
                value="35k free / mo"
                hint="$9.60 / 1,000 after free tier"
              />
              <Metric
                label="Photos"
                value="35k free / mo"
                hint="$2.10 / 1,000 after free tier"
              />
            </div>
            <p className="text-sm text-white/50">
              Today post-free estimate: ${todayPostFreeEstimateUsd.toFixed(2)} if you had already exhausted the monthly free tier.
            </p>
          </div>

          <div className="mt-4 grid gap-3 rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
              Rate Limits (Short Window)
            </p>
            <p className="text-sm text-white/55">
              These are enforced per IP address bucket via `api_rate_limits`.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric
                label="Autocomplete"
                value={`${autocompleteWindowLimit} / ${autocompleteWindowSeconds}s`}
              />
              <Metric
                label="Destinations"
                value={`${destinationsWindowLimit} / ${destinationsWindowSeconds}s`}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-2 text-xs text-white/45">{hint}</p> : null}
    </div>
  );
}

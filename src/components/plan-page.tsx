"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, LoaderCircle, Route, Share2, Users } from "lucide-react";
import { buildMapUrl } from "@/lib/destinations";
import type { DestinationRecord, PlanRecord } from "@/lib/plans";

function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

export function PlanPage({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<PlanRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const inviteLink = `${getBaseUrl()}/join/${planId}`;

  const midpoint = useMemo(() => {
    if (!plan || plan.participants.length === 0) {
      return null;
    }

    const totals = plan.participants.reduce(
      (sum, participant) => {
        sum.lat += participant.location.lat;
        sum.lng += participant.location.lng;
        return sum;
      },
      { lat: 0, lng: 0 },
    );

    return {
      lat: totals.lat / plan.participants.length,
      lng: totals.lng / plan.participants.length,
    };
  }, [plan]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlan(showLoading: boolean) {
      try {
        if (showLoading) {
          setLoading(true);
        }
        const response = await fetch(`/api/plans/${planId}`, { cache: "no-store" });
        const payload = (await response.json()) as { plan?: PlanRecord; error?: string } | undefined;
        if (!response.ok || !payload?.plan || cancelled) {
          if (!cancelled) {
            setError(payload?.error || "Could not load this plan.");
          }
          return;
        }
        setPlan(payload.plan);
        setHasSearched(payload.plan.destinations.length > 0);
        setError("");
      } catch {
        if (!cancelled) {
          setError("Could not load this plan.");
        }
      } finally {
        if (!cancelled && showLoading) {
          setLoading(false);
        }
      }
    }

    void loadPlan(true);
    const interval = window.setInterval(() => void loadPlan(false), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [planId]);

  async function handleFindDestinations() {
    if (!plan || plan.participants.length < 2) {
      return;
    }

    try {
      setPlacesLoading(true);
      setPlacesError("");
      setHasSearched(true);
      const response = await fetch(`/api/plans/${planId}/destinations`, { method: "POST" });
      const payload = (await response.json()) as { plan?: PlanRecord; error?: string } | undefined;
      if (!response.ok || !payload?.plan) {
        setPlacesError(payload?.error || "Could not find destinations right now.");
        return;
      }
      setPlan(payload.plan);
    } catch {
      setPlacesError("Could not find destinations right now.");
    } finally {
      setPlacesLoading(false);
    }
  }

  async function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
  }

  async function handleShare() {
    if (typeof navigator === "undefined") {
      return;
    }
    if (navigator.share) {
      await navigator.share({
        title: `Join ${plan?.groupName || "my plan"} on Where To`,
        text: `Join ${plan?.groupName || "our plan"} and add your location.`,
        url: inviteLink,
      });
      return;
    }
    await handleCopy();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#09090c] px-4 py-8 text-white">
        <div className="mx-auto flex max-w-md items-center gap-3 rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-4">
          <LoaderCircle className="h-5 w-5 animate-spin text-amber-300" />
          Loading your plan...
        </div>
      </main>
    );
  }

  if (error || !plan) {
    return (
      <main className="min-h-screen bg-[#09090c] px-4 py-8 text-white">
        <div className="mx-auto max-w-md rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] uppercase tracking-[0.32em] text-white/40">Where To</p>
          <h1 className="mt-3 text-3xl">Plan unavailable</h1>
          <p className="mt-3 text-sm leading-7 text-white/55">{error || "This plan could not be loaded."}</p>
          <Link href="/" className="mt-5 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950">
            Create another
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#09090c] text-white">
      <div className="mx-auto max-w-md px-4 py-5">
        <div className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4 shadow-2xl shadow-black/30">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.38em] text-amber-300/80">Where To</p>
              <h1 className="mt-2 text-3xl leading-none">{plan.groupName}</h1>
              <p className="mt-2 text-sm text-white/50">{plan.category} · {plan.id}</p>
            </div>
            <div className="grid gap-2">
              <button onClick={handleShare} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-950">
                <span className="inline-flex items-center gap-2"><Share2 className="h-3.5 w-3.5" />Share</span>
              </button>
              <button onClick={handleCopy} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white">
                <span className="inline-flex items-center gap-2"><Copy className="h-3.5 w-3.5" />{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="People" value={String(plan.participants.length)} />
            <Stat label="Results" value={String(plan.destinations.length)} />
            <Stat label="Midpoint" value={midpoint ? "Ready" : "Pending"} />
          </div>
        </div>

        <section className="mt-4 rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-emerald-300/70">Waiting room</p>
              <p className="mt-1 text-sm text-white/55">Live join updates.</p>
            </div>
            {midpoint ? (
              <a
                href={buildMapUrl(midpoint.lat, midpoint.lng, "Group midpoint")}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-white/60 underline underline-offset-4"
              >
                Open midpoint
              </a>
            ) : null}
          </div>

          <div className="mt-3 grid gap-2">
            {plan.participants.map((participant) => (
              <div key={participant.id} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{participant.name}</p>
                  <a
                    href={buildMapUrl(participant.location.lat, participant.location.lng, participant.location.label)}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-xs text-white/50 underline decoration-amber-300/30 underline-offset-4"
                  >
                    {participant.location.label}
                  </a>
                </div>
                <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                  Ready
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-[1.8rem] border border-white/10 bg-[#101014] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-amber-300/80">Destinations</p>
              <p className="mt-1 text-sm text-white/55">Fetch once when everyone is in.</p>
            </div>
            <div className="rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/40">
              Shared
            </div>
          </div>

          <button
            onClick={handleFindDestinations}
            disabled={plan.participants.length < 2 || placesLoading}
            className={[
              "mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition",
              plan.participants.length >= 2 && !placesLoading
                ? "bg-amber-300 text-slate-950"
                : "bg-white/10 text-white/40",
            ].join(" ")}
          >
            <Route className="h-4 w-4" />
            {placesLoading ? "Finding destinations..." : "Find best destination"}
          </button>

          {plan.participants.length < 2 ? (
            <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/50">
              Need at least 2 people before searching.
            </div>
          ) : null}
          {placesError ? <p className="mt-3 text-sm text-rose-300">{placesError}</p> : null}
          {hasSearched && plan.destinations.length === 0 && !placesLoading && !placesError ? (
            <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/50">
              No strong matches came back for this category yet.
            </div>
          ) : null}

          {plan.destinations.length > 0 ? (
            <div className="mt-3 grid gap-3">
              {plan.destinations.map((place, index) => (
                <DestinationCard key={place.placeId} place={place} index={index} />
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function DestinationCard({ place, index }: { place: DestinationRecord; index: number }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/75">#{index + 1} pick</p>
          <h3 className="mt-1 text-lg font-semibold">{place.name}</h3>
          <a
            href={buildMapUrl(place.lat, place.lng, place.name)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-xs text-white/50 underline decoration-amber-300/30 underline-offset-4"
          >
            {place.address}
          </a>
        </div>
        <div className="rounded-2xl bg-white/6 px-3 py-2 text-right">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Fairness</p>
          <p className="text-lg font-semibold">{place.fairness}%</p>
        </div>
      </div>
      <div className="mt-3 text-xs text-white/45">{place.averageDistanceKm.toFixed(1)} km avg distance</div>
      <div className="mt-3 grid gap-2">
        {place.distances.map((distance) => (
          <div key={distance.participantId} className="flex items-center justify-between rounded-xl border border-white/6 bg-black/20 px-3 py-2">
            <span className="text-xs text-white/65">{distance.participantName}</span>
            <span className="text-xs font-semibold text-white/85">{distance.distanceKm.toFixed(1)} km</span>
          </div>
        ))}
      </div>
    </article>
  );
}

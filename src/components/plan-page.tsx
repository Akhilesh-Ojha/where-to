"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, LoaderCircle, Route, Share2, Star } from "lucide-react";
import Confetti from "react-confetti";
import { getCategoryFilterLabel, getCategoryLabel } from "@/lib/categories";
import { buildMapUrl } from "@/lib/destinations";
import { getStoredParticipantId } from "@/lib/participant-session";
import type { DestinationRecord, PlanRecord } from "@/lib/plans";

function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

export function PlanPage({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<PlanRecord | null>(null);
  const [currentParticipantId, setCurrentParticipantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [sortBy, setSortBy] = useState<"fairness" | "rating">("fairness");
  const [voteSavingPlaceId, setVoteSavingPlaceId] = useState<string | null>(null);
  const [voteError, setVoteError] = useState("");
  const [decisionPopupOpen, setDecisionPopupOpen] = useState(false);
  const [lastCelebratedDecisionKey, setLastCelebratedDecisionKey] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

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

  const sortedDestinations = useMemo(() => {
    if (!plan) {
      return [];
    }

    const places = [...plan.destinations];

    return places.sort((left, right) => {
      if (sortBy === "rating") {
        const rightRating = right.rating || 0;
        const leftRating = left.rating || 0;

        if (rightRating !== leftRating) {
          return rightRating - leftRating;
        }

        if ((right.userRatingCount || 0) !== (left.userRatingCount || 0)) {
          return (right.userRatingCount || 0) - (left.userRatingCount || 0);
        }

        if (right.fairness !== left.fairness) {
          return right.fairness - left.fairness;
        }

        return left.averageDistanceKm - right.averageDistanceKm;
      }

      if (right.fairness !== left.fairness) {
        return right.fairness - left.fairness;
      }

      if ((right.rating || 0) !== (left.rating || 0)) {
        return (right.rating || 0) - (left.rating || 0);
      }

      return left.averageDistanceKm - right.averageDistanceKm;
    });
  }, [plan, sortBy]);

  const currentVote = useMemo(() => {
    if (!plan || !currentParticipantId) {
      return null;
    }

    return plan.votes.find((vote) => vote.participantId === currentParticipantId) || null;
  }, [currentParticipantId, plan]);

  const highestVoteCount = useMemo(() => {
    if (!plan || plan.destinations.length === 0) {
      return 0;
    }

    return plan.destinations.reduce((highest, destination) => Math.max(highest, destination.voteCount), 0);
  }, [plan]);

  const leadingDestinations = useMemo(() => {
    if (!plan || highestVoteCount <= 0) {
      return [];
    }

    return plan.destinations.filter((destination) => destination.voteCount === highestVoteCount);
  }, [highestVoteCount, plan]);

  const allVotesIn = Boolean(plan && plan.participants.length > 0 && plan.votes.length === plan.participants.length && highestVoteCount > 0);
  const hasVoteTie = allVotesIn && leadingDestinations.length > 1;
  const winningDestination = !hasVoteTie && allVotesIn ? leadingDestinations[0] || null : null;
  const decisionKey = useMemo(() => {
    if (!allVotesIn) {
      return null;
    }

    if (hasVoteTie) {
      return `tie:${leadingDestinations.map((destination) => destination.placeId).sort().join(",")}:${highestVoteCount}`;
    }

    if (winningDestination) {
      return `winner:${winningDestination.placeId}:${highestVoteCount}`;
    }

    return null;
  }, [allVotesIn, hasVoteTie, highestVoteCount, leadingDestinations, winningDestination]);

  useEffect(() => {
    setCurrentParticipantId(getStoredParticipantId(planId));
  }, [planId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function syncViewportSize() {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);

    return () => {
      window.removeEventListener("resize", syncViewportSize);
    };
  }, []);

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

  useEffect(() => {
    if (!decisionKey || decisionKey === lastCelebratedDecisionKey) {
      return;
    }

    setDecisionPopupOpen(true);
    setLastCelebratedDecisionKey(decisionKey);
  }, [decisionKey, lastCelebratedDecisionKey]);

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

  async function handleVote(destinationPlaceId: string) {
    if (!currentParticipantId) {
      setVoteError("Join this plan on this device before voting.");
      return;
    }

    try {
      setVoteSavingPlaceId(destinationPlaceId);
      setVoteError("");
      const response = await fetch(`/api/plans/${planId}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: currentParticipantId, destinationPlaceId }),
      });
      const payload = (await response.json()) as { plan?: PlanRecord; error?: string } | undefined;

      if (!response.ok || !payload?.plan) {
        setVoteError(payload?.error || "Could not save your vote right now.");
        return;
      }

      setPlan(payload.plan);
    } catch {
      setVoteError("Could not save your vote right now.");
    } finally {
      setVoteSavingPlaceId(null);
    }
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
    <main className="min-h-screen overflow-x-hidden bg-[#09090c] text-white">
      <div className="mx-auto max-w-md overflow-x-hidden px-4 py-5">
        <div className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4 shadow-2xl shadow-black/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.38em] text-amber-300/80">Where To</p>
              <h1 className="mt-2 break-words text-3xl leading-none">{plan.groupName}</h1>
              <p className="mt-2 truncate text-sm text-white/50">
                {getCategoryLabel(plan.category)}
                {plan.subcategory ? ` · ${getCategoryFilterLabel(plan.category, plan.subcategory)}` : ""}
                {" · "}
                {plan.id}
              </p>
            </div>
            <div className="grid gap-2">
              <button onClick={handleShare} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-950">
                <span className="inline-flex items-center gap-2">
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </span>
              </button>
              <button onClick={handleCopy} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white">
                <span className="inline-flex items-center gap-2">
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied" : "Copy"}
                </span>
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="People" value={String(plan.participants.length)} />
            <Stat
              label="Category"
              value={
                plan.subcategory
                  ? `${getCategoryLabel(plan.category)} / ${getCategoryFilterLabel(plan.category, plan.subcategory) || ""}`
                  : getCategoryLabel(plan.category)
              }
            />
          </div>
        </div>

        <section className="mt-4 rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-emerald-300/70">Waiting room</p>
              <p className="mt-1 text-sm text-white/55">Live join updates.</p>
            </div>
            {midpoint ? (
              <a
                href={buildMapUrl(midpoint.lat, midpoint.lng, "Group midpoint")}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs font-semibold text-white/60 underline underline-offset-4"
              >
                Open midpoint
              </a>
            ) : null}
          </div>

          <div className="mt-3 grid gap-2">
            {plan.participants.map((participant) => (
              <div key={participant.id} className="flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{participant.name}</p>
                  <a
                    href={buildMapUrl(participant.location.lat, participant.location.lng, participant.location.label)}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-white/50 underline decoration-amber-300/30 underline-offset-4"
                  >
                    {participant.location.label}
                  </a>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
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
              <p className="mt-1 text-sm text-white/55">
                {plan.destinations.length > 0 ? "Each person gets one vote." : "Fetch once when everyone is in."}
              </p>
            </div>
            <div className="rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/40">
              Shared
            </div>
          </div>

          <button
            onClick={handleFindDestinations}
            disabled={plan.participants.length < 2 || placesLoading || plan.destinations.length > 0}
            className={[
              "mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition",
              plan.participants.length >= 2 && !placesLoading && plan.destinations.length === 0
                ? "bg-amber-300 text-slate-950"
                : "bg-white/10 text-white/40",
            ].join(" ")}
          >
            <Route className="h-4 w-4" />
            {placesLoading
              ? "Finding destinations..."
              : plan.destinations.length > 0
                ? "Destinations locked"
                : "Find best destination"}
          </button>

          {plan.participants.length < 2 ? (
            <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/50">
              Need at least 2 people before searching.
            </div>
          ) : null}
          {placesError ? <p className="mt-3 text-sm text-rose-300">{placesError}</p> : null}
          {voteError ? <p className="mt-3 text-sm text-rose-300">{voteError}</p> : null}
          {hasSearched && plan.destinations.length === 0 && !placesLoading && !placesError ? (
            <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/50">
              No strong matches came back for this category yet.
            </div>
          ) : null}

          {plan.destinations.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="rounded-full border border-emerald-400/10 bg-emerald-400/6 px-3 py-2 text-xs text-emerald-100/85">
                {plan.votes.length} / {plan.participants.length} votes in
              </div>
              <div className="inline-flex rounded-full border border-white/8 bg-white/[0.03] p-1">
                <button
                  type="button"
                  onClick={() => setSortBy("fairness")}
                  className={[
                    "rounded-full px-4 py-2 text-xs font-semibold transition",
                    sortBy === "fairness" ? "bg-amber-300 text-slate-950" : "text-white/55",
                  ].join(" ")}
                >
                  Fairness
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy("rating")}
                  className={[
                    "rounded-full px-4 py-2 text-xs font-semibold transition",
                    sortBy === "rating" ? "bg-amber-300 text-slate-950" : "text-white/55",
                  ].join(" ")}
                >
                  Rating
                </button>
              </div>
            </div>
          ) : null}

          {plan.destinations.length > 0 && !currentParticipantId ? (
            <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/50">
              Join this plan from this device first if you want to cast a vote.
            </div>
          ) : null}

          {plan.destinations.length > 0 ? (
            <div className="mt-3 grid gap-3">
              {sortedDestinations.map((place, index) => (
                <DestinationCard
                  key={place.placeId}
                  place={place}
                  index={index}
                  isLeading={highestVoteCount > 0 && place.voteCount === highestVoteCount}
                  isSelected={currentVote?.destinationPlaceId === place.placeId}
                  isSaving={voteSavingPlaceId === place.placeId}
                  canVote={Boolean(currentParticipantId)}
                  onVote={() => void handleVote(place.placeId)}
                />
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {decisionPopupOpen && allVotesIn ? (
        <DecisionModal
          winner={winningDestination}
          tiedDestinations={hasVoteTie ? leadingDestinations : []}
          onClose={() => setDecisionPopupOpen(false)}
          viewportSize={viewportSize}
        />
      ) : null}
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

function DecisionModal({
  winner,
  tiedDestinations,
  onClose,
  viewportSize,
}: {
  winner: DestinationRecord | null;
  tiedDestinations: DestinationRecord[];
  onClose: () => void;
  viewportSize: { width: number; height: number };
}) {
  const hasTie = tiedDestinations.length > 1;

  if (hasTie) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
        {viewportSize.width > 0 && viewportSize.height > 0 ? (
          <Confetti
            width={viewportSize.width}
            height={viewportSize.height}
            numberOfPieces={160}
            gravity={0.16}
            recycle={false}
            tweenDuration={9000}
            colors={["#FCD34D", "#FDE68A", "#FFFFFF", "#F59E0B"]}
          />
        ) : null}
        <div className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-amber-200/20 bg-[linear-gradient(180deg,rgba(251,191,36,0.18),rgba(14,14,18,0.97))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70"
          >
            Close
          </button>
          <p className="relative text-[11px] uppercase tracking-[0.32em] text-amber-100/80">Votes complete</p>
          <h3 className="relative mt-2 text-2xl font-semibold text-amber-50">It&apos;s a tie</h3>
          <p className="relative mt-2 text-sm leading-6 text-amber-50/78">
            Everyone has voted, but the group is split between these picks. Choose either one and you&apos;re set.
          </p>
          <div className="relative mt-4 grid gap-2">
            {tiedDestinations.map((destination) => (
              <a
                key={destination.placeId}
                href={buildMapUrl(destination.lat, destination.lng, destination.name)}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-amber-100/18 bg-white/8 px-4 py-3 text-sm font-semibold text-amber-50"
              >
                <div>{destination.name}</div>
                <div className="mt-1 text-xs font-normal text-amber-50/65">
                  {destination.voteCount} votes · {destination.averageDistanceKm.toFixed(1)} km avg distance
                </div>
              </a>
            ))}
          </div>
          <div className="relative mt-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950"
            >
              Back to results
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!winner) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
      {viewportSize.width > 0 && viewportSize.height > 0 ? (
        <Confetti
          width={viewportSize.width}
          height={viewportSize.height}
          numberOfPieces={190}
          gravity={0.18}
          recycle={false}
          tweenDuration={10000}
          colors={["#6EE7B7", "#A7F3D0", "#FDE68A", "#FFFFFF", "#34D399"]}
        />
      ) : null}
      <div className="relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-emerald-200/18 bg-[linear-gradient(180deg,rgba(16,185,129,0.2),rgba(14,14,18,0.97))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70"
        >
          Close
        </button>
        <p className="relative text-[11px] uppercase tracking-[0.32em] text-emerald-100/80">Decision made</p>
        <h3 className="relative mt-2 text-2xl font-semibold text-emerald-50">{winner.name}</h3>
        <p className="relative mt-2 text-sm leading-6 text-emerald-50/80">
          Everyone has voted. This place won, so the group can stop comparing and head here.
        </p>
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-emerald-100/18 bg-white/8 px-3 py-2 text-xs font-semibold text-emerald-50">
            {winner.voteCount} votes
          </div>
          <div className="rounded-full border border-emerald-100/18 bg-white/8 px-3 py-2 text-xs text-emerald-50/85">
            {winner.averageDistanceKm.toFixed(1)} km avg distance
          </div>
          {winner.rating ? (
            <div className="rounded-full border border-emerald-100/18 bg-white/8 px-3 py-2 text-xs text-emerald-50/85">
              {winner.rating.toFixed(1)} rating
            </div>
          ) : null}
        </div>
        <div className="relative mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <a
            href={buildMapUrl(winner.lat, winner.lng, winner.name)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950"
          >
            Open in Maps
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/12 bg-white/6 px-4 py-3 text-sm font-semibold text-white"
          >
            Back to results
          </button>
        </div>
      </div>
    </div>
  );
}

function DestinationCard({
  place,
  index,
  isLeading,
  isSelected,
  isSaving,
  canVote,
  onVote,
}: {
  place: DestinationRecord;
  index: number;
  isLeading: boolean;
  isSelected: boolean;
  isSaving: boolean;
  canVote: boolean;
  onVote: () => void;
}) {
  return (
    <article
      className={[
        "overflow-hidden rounded-2xl border p-4 transition",
        isLeading
          ? "border-amber-200/45 bg-[linear-gradient(180deg,rgba(251,191,36,0.12),rgba(255,255,255,0.03))] shadow-[0_0_0_1px_rgba(253,230,138,0.16),0_20px_40px_rgba(245,158,11,0.12)]"
          : "border-white/8 bg-white/[0.03]",
      ].join(" ")}
    >
      {place.photoUrls.length > 0 ? (
        <div className="-mx-1 mb-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {place.photoUrls.map((photoUrl, photoIndex) => (
            <div
              key={`${place.placeId}-photo-${photoIndex}`}
              className="relative h-44 min-w-[88%] snap-center overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]"
            >
              <img
                src={photoUrl}
                alt={`${place.name} photo ${photoIndex + 1}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] uppercase tracking-[0.24em] text-amber-300/75">#{index + 1} pick</p>
            {isLeading ? (
              <span className="rounded-full border border-amber-200/35 bg-amber-300/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-50">
                Leading
              </span>
            ) : null}
            {isSelected ? (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                Your vote
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 break-words text-lg font-semibold">{place.name}</h3>
          <a
            href={buildMapUrl(place.lat, place.lng, place.name)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-xs text-white/50 underline decoration-amber-300/30 underline-offset-4"
          >
            {place.address}
          </a>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {place.rating ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/15 bg-amber-300/8 px-3 py-1 text-xs text-amber-100/90">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span>{place.rating.toFixed(1)}</span>
                {place.userRatingCount ? <span className="text-white/45">({place.userRatingCount})</span> : null}
              </div>
            ) : null}
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/12 bg-emerald-300/8 px-3 py-1 text-xs text-emerald-100/90">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{place.voteCount} votes</span>
            </div>
          </div>
        </div>
        <div className={["shrink-0 rounded-2xl px-3 py-2 text-right", isLeading ? "bg-amber-300/12" : "bg-white/6"].join(" ")}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Fairness</p>
          <p className="text-lg font-semibold">{place.fairness}%</p>
        </div>
      </div>
      <div className="mt-3 text-xs text-white/45">{place.averageDistanceKm.toFixed(1)} km avg distance</div>
      <div className="mt-3 grid gap-2">
        {place.distances.map((distance) => (
          <div key={distance.participantId} className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-black/20 px-3 py-2">
            <span className="min-w-0 truncate text-xs text-white/65">{distance.participantName}</span>
            <span className="shrink-0 text-xs font-semibold text-white/85">{distance.distanceKm.toFixed(1)} km</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onVote}
        disabled={!canVote || isSaving}
        className={[
          "mt-3 flex h-11 w-full items-center justify-center rounded-2xl text-sm font-semibold transition",
          canVote && !isSaving
            ? isSelected
              ? "bg-emerald-300/14 text-emerald-100 ring-1 ring-inset ring-emerald-300/25"
              : "bg-white/8 text-white hover:bg-white/12"
            : "bg-white/8 text-white/35",
        ].join(" ")}
      >
        {isSaving ? "Saving vote..." : isSelected ? "Voted" : "Vote for this place"}
      </button>
    </article>
  );
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Crosshair, LoaderCircle, Search } from "lucide-react";
import { buildMapUrl } from "@/lib/destinations";
import { getStoredParticipantId, storeParticipantId } from "@/lib/participant-session";
import type { PlanRecord } from "@/lib/plans";

type PlaceSuggestion = {
  placeId: string;
  text: string;
  secondaryText: string;
  lat: number;
  lng: number;
};

type LocationSelection = PlanRecord["hostLocation"];

type PermissionAwareNavigator = Navigator & {
  permissions?: {
    query: (descriptor: { name: "geolocation" }) => Promise<{ state: "granted" | "denied" | "prompt" }>;
  };
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

function prettifyPlanName(planId: string) {
  const withoutSuffix = planId.replace(/-[a-z0-9]{4,}$/i, "");
  return withoutSuffix
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getLocationHelpMessage() {
  return "Allow location in your browser's site settings, then try Use mine again. If needed, also enable Location Services for your browser or device. You can always search manually instead.";
}

function getGeolocationErrorMessage(error?: { code?: number }) {
  if (error?.code === 1) {
    return `Location access is blocked. ${getLocationHelpMessage()}`;
  }

  if (error?.code === 2) {
    return "Your location couldn’t be determined right now. Check your signal and try again, or search manually instead.";
  }

  if (error?.code === 3) {
    return "Location took too long to respond. Try again, or search manually instead.";
  }

  return "Couldn’t get your precise location. Pick a place manually instead.";
}

export function JoinPage({ planId }: { planId: string }) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState<LocationSelection | null>(null);
  const [locationError, setLocationError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingExistingJoin, setCheckingExistingJoin] = useState(true);
  const [submitError, setSubmitError] = useState("");
  const [manualSelectionLocked, setManualSelectionLocked] = useState(false);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 350);
  const router = useRouter();

  const displayPlanName = useMemo(() => prettifyPlanName(planId) || "Group Plan", [planId]);
  const canJoin = Boolean(name.trim() && location);

  useEffect(() => {
    let cancelled = false;
    const storedParticipantId = getStoredParticipantId(planId);

    if (!storedParticipantId) {
      setCheckingExistingJoin(false);
      return;
    }

    async function checkExistingJoin() {
      try {
        const response = await fetch(`/api/plans/${planId}`, { cache: "no-store" });
        const payload = (await response.json()) as { plan?: PlanRecord } | undefined;

        if (!response.ok || !payload?.plan || cancelled) {
          if (!cancelled) {
            setCheckingExistingJoin(false);
          }
          return;
        }

        const participantStillExists = payload.plan.participants.some(
          (participant) => participant.id === storedParticipantId,
        );

        if (participantStillExists) {
          router.replace(`/plan/${planId}`);
          return;
        }

        if (!cancelled) {
          setCheckingExistingJoin(false);
        }
      } catch {
        if (!cancelled) {
          setCheckingExistingJoin(false);
        }
      }
    }

    void checkExistingJoin();

    return () => {
      cancelled = true;
    };
  }, [planId, router]);

  useEffect(() => {
    const query = debouncedSearchQuery.trim();
    const selectedManualQuery =
      location?.mode === "manual" && query.toLowerCase() === location.label.trim().toLowerCase();

    if (selectedManualQuery) {
      setPlaceSuggestions([]);
      setPlacesLoading(false);
      setPlacesError("");
      return;
    }

    if (query.length < 2) {
      setPlaceSuggestions([]);
      setPlacesLoading(false);
      setPlacesError("");
      return;
    }

    const controller = new AbortController();

    async function loadPlaces() {
      try {
        setPlacesLoading(true);
        setPlacesError("");
        const response = await fetch("/api/places/autocomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: query }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as
          | { suggestions?: PlaceSuggestion[]; error?: string }
          | undefined;

        if (!response.ok) {
          setPlaceSuggestions([]);
          setPlacesError(payload?.error || "Could not load places right now.");
          return;
        }

        setPlaceSuggestions(payload?.suggestions || []);
      } catch {
        if (!controller.signal.aborted) {
          setPlaceSuggestions([]);
          setPlacesError("Could not load places right now.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setPlacesLoading(false);
        }
      }
    }

    void loadPlaces();
    return () => controller.abort();
  }, [debouncedSearchQuery]);

  async function handleUseCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("Location access is not supported on this device.");
      return;
    }

    setLocationError("");
    setManualSelectionLocked(false);

    try {
      const permissionNavigator = navigator as PermissionAwareNavigator;
      const permissionState = await permissionNavigator.permissions?.query({
        name: "geolocation",
      });

      if (permissionState?.state === "denied") {
        setLocationError(`Location access is blocked. ${getLocationHelpMessage()}`);
        return;
      }
    } catch {
      // Ignore permission preflight failures and let the browser handle the prompt.
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocation({
          mode: "gps",
          label: "Current location",
          address: "Captured from device GPS",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      (error) => setLocationError(getGeolocationErrorMessage(error)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function handleManualPick(place: PlaceSuggestion) {
    setLocationError("");
    setPlacesError("");
    setSearchQuery(place.text);
    setPlaceSuggestions([]);
    setManualSelectionLocked(true);
    setLocation({
      mode: "manual",
      label: place.text,
      address: place.secondaryText,
      lat: place.lat,
      lng: place.lng,
      placeId: place.placeId,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canJoin) {
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError("");
      const response = await fetch(`/api/plans/${planId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), location }),
      });
      const payload = (await response.json()) as
        | { error?: string; plan?: PlanRecord; participant?: { id: string } }
        | undefined;
      if (!response.ok) {
        setSubmitError(payload?.error || "Could not join this plan right now.");
        return;
      }
      if (payload?.participant?.id) {
        storeParticipantId(planId, payload.participant.id);
      }
      router.push(`/plan/${planId}`);
    } catch {
      setSubmitError("Could not join this plan right now.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingExistingJoin) {
    return (
      <main className="min-h-screen overflow-x-hidden bg-[#09090c] text-white">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col overflow-x-hidden px-4 py-5">
          <div className="flex items-center gap-3 rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-4">
            <LoaderCircle className="h-5 w-5 animate-spin text-amber-300" />
            <p className="text-sm text-white/70">Checking your join status...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#09090c] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col overflow-x-hidden px-4 py-5">
        <div className="mb-4 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.38em] text-amber-300/80">Meetfair</p>
          <h1 className="mt-2 max-w-[18rem] truncate text-3xl leading-none">Join {displayPlanName}</h1>
          <p className="mt-2 text-sm text-white/55">Add your name and one accurate location.</p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <section className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-4">
            <div className="grid gap-3">
              <label className="grid gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
                  Your name
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name"
                  className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/40 md:text-sm"
                />
              </label>

              <div className="flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.26em] text-white/40">Plan</p>
                  <p className="mt-1 truncate text-sm font-semibold">{displayPlanName}</p>
                </div>
                <span className="max-w-[10rem] shrink truncate rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/45">
                  {planId}
                </span>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.32em] text-emerald-300/70">Location</p>
                <p className="mt-1 text-sm text-white/65">Use GPS or search manually.</p>
              </div>
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-950"
              >
                <span className="inline-flex items-center gap-2">
                  <Crosshair className="h-3.5 w-3.5" />
                  Use mine
                </span>
              </button>
            </div>

            {location ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-emerald-300/15 p-2 text-emerald-200">
                    <Check className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <a
                      href={buildMapUrl(location.lat, location.lng, location.label)}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm font-semibold underline decoration-emerald-300/30 underline-offset-4"
                    >
                      {location.label}
                    </a>
                    <p className="truncate text-xs text-white/50">{location.address}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {locationError ? <p className="mt-3 text-sm text-rose-300">{locationError}</p> : null}

            <div className="relative mt-3 min-w-0">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                value={searchQuery}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSearchQuery(nextValue);
                  setManualSelectionLocked(
                    location?.mode === "manual" &&
                      nextValue.trim().toLowerCase() === location.label.trim().toLowerCase(),
                  );
                }}
                placeholder="Search area or landmark"
                className="h-12 min-w-0 w-full rounded-2xl border border-white/10 bg-black/20 pl-11 pr-4 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/40 md:text-sm"
              />
            </div>

            <div className="mt-3 grid gap-2">
              {placesLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/55">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Finding places...
                </div>
              ) : null}
              {!manualSelectionLocked &&
                placeSuggestions.slice(0, 10).map((place) => (
                  <button
                    key={place.placeId}
                    type="button"
                    onClick={() => handleManualPick(place)}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition"
                  >
                    <p className="text-sm font-semibold">{place.text}</p>
                    <p className="mt-1 text-xs text-white/50">{place.secondaryText}</p>
                  </button>
                ))}
              {placesError ? <p className="text-sm text-rose-300">{placesError}</p> : null}
            </div>
          </section>

          <button
            type="submit"
            disabled={!canJoin || submitting}
            className={[
              "flex h-14 items-center justify-center rounded-2xl text-sm font-semibold transition",
              canJoin && !submitting ? "bg-amber-300 text-slate-950" : "bg-white/10 text-white/40",
            ].join(" ")}
          >
            {submitting ? "Joining..." : "Join plan"}
          </button>

          {submitError ? <p className="text-sm text-rose-300">{submitError}</p> : null}
        </form>
      </div>
    </main>
  );
}

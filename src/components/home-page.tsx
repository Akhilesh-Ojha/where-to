"use client";

import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clapperboard,
  Check,
  Coffee,
  Crosshair,
  Martini,
  LoaderCircle,
  ShoppingBag,
  Search,
  Sparkles,
  Volleyball,
  UtensilsCrossed,
  Waves,
} from "lucide-react";
import { getCategoryDefinition, type CategoryId } from "@/lib/categories";
import { storeParticipantId } from "@/lib/participant-session";
import type { SavedLocation } from "@/lib/plans";

type CategoryOption = {
  id: CategoryId;
  label: string;
  icon: typeof Martini;
  glow: string;
};

type PlaceSuggestion = {
  placeId: string;
  text: string;
  secondaryText: string;
  lat: number;
  lng: number;
};

type LocationSelection =
  | {
      mode: "gps";
      label: string;
      address: string;
      lat: number;
      lng: number;
    }
  | {
      mode: "manual";
      label: string;
      address: string;
      lat: number;
      lng: number;
      placeId: string;
    };

type HomeFormState = {
  hostName: string;
  groupName: string;
  category: CategoryId;
  subcategories: string[];
};

type PermissionAwareNavigator = Navigator & {
  permissions?: {
    query: (descriptor: { name: "geolocation" }) => Promise<{ state: "granted" | "denied" | "prompt" }>;
  };
};

const categories: CategoryOption[] = [
  { id: "restaurant", label: "Restaurant", icon: UtensilsCrossed, glow: "from-orange-300/30 to-rose-400/20" },
  { id: "pub", label: "Nightlife", icon: Martini, glow: "from-amber-300/30 to-rose-400/20" },
  { id: "cafe", label: "Cafe", icon: Coffee, glow: "from-stone-200/30 to-amber-300/20" },
  { id: "wellness", label: "Wellness", icon: Waves, glow: "from-emerald-300/30 to-teal-400/20" },
  { id: "sports", label: "Sports", icon: Volleyball, glow: "from-cyan-300/30 to-sky-400/20" },
  { id: "shopping", label: "Shopping", icon: ShoppingBag, glow: "from-sky-300/30 to-blue-400/20" },
  { id: "movies", label: "Movies", icon: Clapperboard, glow: "from-violet-300/30 to-indigo-400/20" },
  { id: "events", label: "Activities", icon: Sparkles, glow: "from-fuchsia-300/30 to-violet-400/20" },
];

function getDefaultSubcategory(categoryId: CategoryId) {
  return getCategoryDefinition(categoryId).filters[0]?.id ?? null;
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

  return "Couldn’t get your precise location. Search manually instead.";
}

const initialForm: HomeFormState = {
  hostName: "",
  groupName: "",
  category: "restaurant" as CategoryId,
  subcategories: getDefaultSubcategory("restaurant") ? [getDefaultSubcategory("restaurant") as string] : [],
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export function HomePage() {
  const [form, setForm] = useState<HomeFormState>(initialForm);
  const [location, setLocation] = useState<LocationSelection | null>(null);
  const [locationError, setLocationError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [redirectingToHost, setRedirectingToHost] = useState(false);
  const [createError, setCreateError] = useState("");
  const [manualSelectionLocked, setManualSelectionLocked] = useState(false);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 350);
  const router = useRouter();
  const selectedCategory = getCategoryDefinition(form.category);
  const selectedSubcategories = form.subcategories || [];

  const canCreate = Boolean(form.hostName.trim() && form.groupName.trim() && location);
  const createDisabled = !canCreate || creatingPlan || redirectingToHost;

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
          body: JSON.stringify({
            input: query,
            locationBias: location
              ? { latitude: location.lat, longitude: location.lng }
              : undefined,
          }),
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
  }, [debouncedSearchQuery, location]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) {
      return;
    }

    try {
      setCreatingPlan(true);
      setRedirectingToHost(false);
      setCreateError("");

      const response = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupName: form.groupName.trim(),
            category: form.category,
            subcategories: selectedSubcategories,
            createdBy: form.hostName.trim(),
            hostLocation: location as SavedLocation,
          }),
      });

      const payload = (await response.json()) as
        | { plan?: { id: string }; participant?: { id: string }; error?: string }
        | undefined;

      if (!response.ok || !payload?.plan) {
        setCreateError(payload?.error || "Could not create the plan right now.");
        return;
      }

      if (payload.participant?.id) {
        storeParticipantId(payload.plan.id, payload.participant.id);
      }

      setRedirectingToHost(true);
      router.push(`/plan/${payload.plan.id}`);
    } catch {
      setCreateError("Could not create the plan right now.");
      setCreatingPlan(false);
      setRedirectingToHost(false);
    }
  }

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
      (position) => {
        setLocation({
          mode: "gps",
          label: "Current location",
          address: "Captured from device GPS",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
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

  return (
    <main className="min-h-dvh overscroll-y-contain bg-[#09090c] text-white">
      <div className="mx-auto w-full max-w-md px-4 py-5 pb-8">
        <div className="mb-4">
          <h1 className="text-[2.9rem] leading-[0.92] text-white sm:text-[3.4rem]">Meetfair</h1>
          <p className="mt-2 max-w-[18rem] text-sm leading-6 text-white/58">
            Find the fairest place to meet.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <section className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="grid gap-3">
              <div className="grid gap-3">
                <Field
                  id="hostName"
                  label="Your name"
                  value={form.hostName}
                  onChange={(value) => setForm((current) => ({ ...current, hostName: value }))}
                  placeholder="Name"
                />
                <Field
                  id="groupName"
                  label="Group"
                  value={form.groupName}
                  onChange={(value) => setForm((current) => ({ ...current, groupName: value }))}
                  placeholder="Group Name"
                />
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
                  Category
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {categories.map((category) => {
                    const Icon = category.icon;
                    const active = form.category === category.id;

                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            category: category.id,
                            subcategories: getDefaultSubcategory(category.id)
                              ? [getDefaultSubcategory(category.id) as string]
                              : [],
                          }))
                        }
                        className={[
                          "relative overflow-hidden rounded-2xl border px-3 py-3 text-left transition",
                          active
                            ? "border-amber-200 bg-amber-300/22 text-white shadow-[0_0_0_1px_rgba(253,230,138,0.55),0_18px_40px_rgba(251,191,36,0.16)]"
                            : "border-white/8 bg-white/[0.03] text-white/70",
                        ].join(" ")}
                      >
                        <div className={`absolute inset-0 bg-gradient-to-br ${category.glow} ${active ? "opacity-100" : "opacity-65"}`} />
                        <div className={`absolute inset-0 ${active ? "ring-1 ring-inset ring-amber-100/50" : ""}`} />
                        <div className="relative flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Icon className={active ? "h-4 w-4 text-amber-100" : "h-4 w-4"} />
                            <span
                              className={["text-xs font-semibold", active ? "text-white" : ""].join(" ")}
                              style={{ fontFamily: "var(--font-body), sans-serif" }}
                            >
                              {category.label}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedCategory.filters.length > 0 ? (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
                      Filter
                    </p>
                    <p className="text-[11px] text-white/35">Pick up to 3</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedCategory.filters.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() =>
                          setForm((current) => {
                            const currentSubcategories = current.subcategories || [];
                            const isSelected = currentSubcategories.includes(filter.id);

                            if (isSelected) {
                              const nextSubcategories = currentSubcategories.filter(
                                (selectedFilterId) => selectedFilterId !== filter.id,
                              );

                              return {
                                ...current,
                                subcategories:
                                  nextSubcategories.length > 0
                                    ? nextSubcategories
                                    : [selectedCategory.filters[0]?.id || filter.id],
                              };
                            }

                            if (currentSubcategories.length >= 3) {
                              return current;
                            }

                            return {
                              ...current,
                              subcategories: [...currentSubcategories, filter.id],
                            };
                          })
                        }
                        className={[
                          "inline-flex items-center justify-center rounded-2xl border px-4 py-1.5 text-xs font-semibold transition",
                          selectedSubcategories.includes(filter.id)
                            ? "border-amber-200/85 bg-[linear-gradient(135deg,rgba(251,191,36,0.26),rgba(245,158,11,0.12))] text-amber-50 shadow-[0_0_0_1px_rgba(253,230,138,0.35),0_10px_24px_rgba(245,158,11,0.18)]"
                            : "border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] text-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/15 hover:bg-white/[0.05] hover:text-white/82",
                        ].join(" ")}
                        style={{ borderRadius: "12px", padding: "8px 22px" }} 
                      >
                        <span
                          className="text-xs font-semibold"
                          style={{ fontFamily: "var(--font-body), sans-serif" }}
                        >
                          {filter.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.32em] text-emerald-300/70">Location</p>
                <p className="mt-1 text-sm text-white/70">Use GPS or search manually.</p>
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
              <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-emerald-300/15 p-2 text-emerald-200">
                    <Check className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{location.label}</p>
                    <p className="truncate text-xs text-white/55">{location.address}</p>
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
                <InlineNotice icon={<LoaderCircle className="h-4 w-4 animate-spin" />} text="Finding places..." />
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
            disabled={createDisabled}
            className={[
              "flex h-14 items-center justify-center rounded-2xl text-sm font-semibold transition",
              !createDisabled
                ? "bg-amber-300 text-slate-950"
                : "bg-white/10 text-white/40",
            ].join(" ")}
          >
            {redirectingToHost ? "Opening host room..." : creatingPlan ? "Creating plan..." : "Create plan"}
          </button>

          {createError ? <p className="text-sm text-rose-300">{createError}</p> : null}
          <p className="text-center text-[11px] tracking-[0.08em] text-white/34">
            Built by Akhil for indecisive groups.
          </p>
        </form>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label htmlFor={id} className="grid gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-white/45">
        {label}
      </span>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none placeholder:text-white/30 focus:border-amber-300/40 md:text-sm"
      />
    </label>
  );
}

function InlineNotice({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm text-white/55">
      {icon}
      {text}
    </div>
  );
}

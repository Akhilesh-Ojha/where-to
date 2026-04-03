import { getSupabaseAdmin } from "@/lib/supabase-server";
import { buildCategorySearchText, type CategoryId } from "@/lib/categories";

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
    languageCode?: string;
  };
  formattedAddress?: string;
  primaryType?: string;
  rating?: number;
  userRatingCount?: number;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  photos?: Array<{
    name?: string;
  }>;
};

type GoogleTextSearchResponse = {
  places?: GooglePlace[];
};

type GoogleNearbySearchResponse = {
  places?: GooglePlace[];
};

export type GoogleSuggestion = {
  placeId: string;
  text: string;
  secondaryText: string;
  lat: number;
  lng: number;
  type: string;
  rating: number | null;
  userRatingCount: number | null;
  photoUrls: string[];
  photoNames: string[];
};

const DEFAULT_AUTOCOMPLETE_DAILY_LIMIT = 300;
const DEFAULT_NEARBY_DAILY_LIMIT = 150;
const DEFAULT_NEARBY_SEARCH_RADIUS_METERS = 7000;
const BROAD_LOCATION_TYPES = new Set([
  "locality",
  "sublocality",
  "postal_town",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "country",
  "postal_code",
]);

function getApiKey() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_MAPS_API_KEY. Add it to your environment before using Google Places.");
  }

  return apiKey;
}

function getDailyLimit(envName: string, fallback: number) {
  const rawValue = process.env[envName];
  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

async function consumeDailyQuota(serviceName: string, dailyLimit: number) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("consume_daily_api_quota", {
    service_name: serviceName,
    daily_limit: dailyLimit,
  });

  if (error) {
    throw new Error(`Failed to enforce daily API quota: ${error.message}`);
  }

  if (!data) {
    throw new Error("Daily Google Places limit reached for today.");
  }
}

function mapGooglePlace(place: GooglePlace): GoogleSuggestion | null {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;

  if (!place.id || typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  return {
    placeId: place.id,
    text: place.displayName?.text || "Unnamed place",
    secondaryText: place.formattedAddress || "",
    lat,
    lng,
    type: place.primaryType || "place",
    rating: typeof place.rating === "number" ? place.rating : null,
    userRatingCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    photoUrls: [],
    photoNames: (place.photos || [])
      .map((photo) => photo.name)
      .filter((value): value is string => Boolean(value))
      .slice(0, 5),
  };
}

function isGoogleSuggestion(
  suggestion: GoogleSuggestion | null,
): suggestion is GoogleSuggestion {
  return Boolean(suggestion);
}

function isSpecificMeetupSuggestion(suggestion: GoogleSuggestion) {
  if (BROAD_LOCATION_TYPES.has(suggestion.type)) {
    return false;
  }

  const label = suggestion.text.trim().toLowerCase();
  const address = suggestion.secondaryText.trim().toLowerCase();

  if (!address) {
    return false;
  }

  if (label === address) {
    return false;
  }

  const addressParts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (addressParts.length <= 2 && !label.includes(" ") && !label.includes("-")) {
    return false;
  }

  return true;
}

function dedupeSuggestions(suggestions: GoogleSuggestion[], limit: number) {
  const seen = new Set<string>();
  const unique: GoogleSuggestion[] = [];

  for (const suggestion of suggestions) {
    const key = `${suggestion.placeId}::${suggestion.text.trim().toLowerCase()}::${suggestion.secondaryText
      .trim()
      .toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(suggestion);

    if (unique.length >= limit) {
      break;
    }
  }

  return unique;
}

async function fetchPhotoUri(photoName: string, maxWidthPx = 800) {
  const response = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`,
    {
      headers: {
        "X-Goog-Api-Key": getApiKey(),
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { photoUri?: string };
  return payload.photoUri || null;
}

export async function hydrateSuggestionPhotos(suggestions: GoogleSuggestion[]) {
  return Promise.all(
    suggestions.map(async (suggestion) => {
      if (suggestion.photoNames.length === 0) {
        return suggestion;
      }

      const photoUrls = (
        await Promise.all(suggestion.photoNames.map((photoName) => fetchPhotoUri(photoName)))
      ).filter((value): value is string => Boolean(value));

      return {
        ...suggestion,
        photoUrls,
      };
    }),
  );
}

function offsetCoordinates(
  center: { lat: number; lng: number },
  latOffsetKm: number,
  lngOffsetKm: number,
) {
  const latDelta = latOffsetKm / 111;
  const lngDelta = lngOffsetKm / Math.max(1, 111 * Math.cos((center.lat * Math.PI) / 180));

  return {
    lat: center.lat + latDelta,
    lng: center.lng + lngDelta,
  };
}

function dedupeSearchQueries(queries: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const query of queries) {
    const normalized = query.trim().toLowerCase();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(query);
  }

  return unique;
}

function getNearbySearchQueries(
  category: CategoryId,
  subcategory?: string | null,
  subcategories: string[] = [],
) {
  if (subcategories.length > 0) {
    return dedupeSearchQueries(
      subcategories.map((selectedSubcategory) =>
        buildCategorySearchText(category, selectedSubcategory),
      ),
    );
  }

  if (subcategory) {
    return [buildCategorySearchText(category, subcategory)];
  }

  switch (category) {
    case "pub":
      return dedupeSearchQueries(["pub", "bar", "brewery"]);
    case "cafe":
      return dedupeSearchQueries(["cafe", "coffee shop", "bakery"]);
    case "restaurant":
      return dedupeSearchQueries(["restaurant", "dine in restaurant"]);
    case "events":
      return dedupeSearchQueries(["event venue", "activity center", "live music venue"]);
    default:
      return [buildCategorySearchText(category, subcategory)];
  }
}

async function fetchNearbySearchSlice(input: {
  lat: number;
  lng: number;
  query: string;
  limit: number;
  radiusMeters: number;
}) {
  const apiKey = getApiKey();
  await consumeDailyQuota(
    "google_places_nearby",
    getDailyLimit("GOOGLE_PLACES_NEARBY_DAILY_LIMIT", DEFAULT_NEARBY_DAILY_LIMIT),
  );

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.rating,places.userRatingCount,places.photos",
    },
    body: JSON.stringify({
      textQuery: input.query,
      maxResultCount: input.limit,
      regionCode: "IN",
      languageCode: "en",
      locationBias: {
        circle: {
          center: {
            latitude: input.lat,
            longitude: input.lng,
          },
          radius: input.radiusMeters,
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Places nearby search failed: ${errorText}`);
  }

  return (await response.json()) as GoogleNearbySearchResponse;
}

export async function searchPlacesByText(input: {
  query: string;
  lat?: number;
  lng?: number;
  limit?: number;
}) {
  const apiKey = getApiKey();
  await consumeDailyQuota(
    "google_places_autocomplete",
    getDailyLimit("GOOGLE_PLACES_AUTOCOMPLETE_DAILY_LIMIT", DEFAULT_AUTOCOMPLETE_DAILY_LIMIT),
  );
  const body: Record<string, unknown> = {
    textQuery: input.query,
    maxResultCount: input.limit ?? 10,
    regionCode: "IN",
    languageCode: "en",
  };

  if (typeof input.lat === "number" && typeof input.lng === "number") {
    body.locationBias = {
      circle: {
        center: {
          latitude: input.lat,
          longitude: input.lng,
        },
        radius: 50000,
      },
    };
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.rating,places.userRatingCount",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Places text search failed: ${errorText}`);
  }

  const data = (await response.json()) as GoogleTextSearchResponse;
  return dedupeSuggestions(
    (data.places || [])
      .map(mapGooglePlace)
      .filter(isGoogleSuggestion)
      .filter(isSpecificMeetupSuggestion),
    input.limit ?? 10,
  );
}

export async function searchNearbyPlaces(input: {
  lat: number;
  lng: number;
  category: CategoryId;
  subcategory?: string | null;
  subcategories?: string[];
  limit?: number;
}) {
  const desiredLimit = input.limit ?? 30;
  const queries = getNearbySearchQueries(
    input.category,
    input.subcategory,
    input.subcategories || [],
  );
  const center = { lat: input.lat, lng: input.lng };
  const searchCenters = [
    center,
    offsetCoordinates(center, 2.2, 0),
    offsetCoordinates(center, -2.2, 0),
    offsetCoordinates(center, 0, 2.2),
    offsetCoordinates(center, 0, -2.2),
  ];
  const perSliceLimit = queries.length > 1 ? 6 : 10;

  const responses = await Promise.all(
    queries.flatMap((query) =>
      searchCenters.map((searchCenter) =>
        fetchNearbySearchSlice({
          lat: searchCenter.lat,
          lng: searchCenter.lng,
          query,
          limit: perSliceLimit,
          radiusMeters: DEFAULT_NEARBY_SEARCH_RADIUS_METERS,
        }),
      ),
    ),
  );

  const allPlaces = responses.flatMap((response) => response.places || []);
  return dedupeSuggestions(
    allPlaces.map(mapGooglePlace).filter(isGoogleSuggestion),
    desiredLimit,
  );
}

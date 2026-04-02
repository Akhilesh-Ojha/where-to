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
};

const DEFAULT_AUTOCOMPLETE_DAILY_LIMIT = 300;
const DEFAULT_NEARBY_DAILY_LIMIT = 150;

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
  };
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

async function attachPhotoUrls(places: GooglePlace[], suggestions: GoogleSuggestion[]) {
  return Promise.all(
    suggestions.map(async (suggestion) => {
      const sourcePlace = places.find((place) => place.id === suggestion.placeId);
      const photoNames = (sourcePlace?.photos || [])
        .map((photo) => photo.name)
        .filter((value): value is string => Boolean(value))
        .slice(0, 3);

      if (photoNames.length === 0) {
        return suggestion;
      }

      const photoUrls = (
        await Promise.all(photoNames.map((photoName) => fetchPhotoUri(photoName)))
      ).filter((value): value is string => Boolean(value));

      return {
        ...suggestion,
        photoUrls,
      };
    }),
  );
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
    (data.places || []).map(mapGooglePlace).filter(Boolean) as GoogleSuggestion[],
    input.limit ?? 10,
  );
}

export async function searchNearbyPlaces(input: {
  lat: number;
  lng: number;
  category: CategoryId;
  subcategory?: string | null;
  limit?: number;
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
      textQuery: buildCategorySearchText(input.category, input.subcategory),
      maxResultCount: input.limit ?? 10,
      regionCode: "IN",
      languageCode: "en",
      locationBias: {
        circle: {
          center: {
            latitude: input.lat,
            longitude: input.lng,
          },
          radius: 8000,
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Places nearby search failed: ${errorText}`);
  }

  const data = (await response.json()) as GoogleNearbySearchResponse;
  const suggestions = dedupeSuggestions(
    (data.places || []).map(mapGooglePlace).filter(Boolean) as GoogleSuggestion[],
    input.limit ?? 10,
  );
  return attachPhotoUrls(data.places || [], suggestions);
}

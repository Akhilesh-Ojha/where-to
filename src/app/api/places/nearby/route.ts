import { NextRequest, NextResponse } from "next/server";

const categoryToTags: Record<string, string[]> = {
  pub: ["amenity:pub,amenity:bar", "pub", "bar"],
  brewery: ["craft:brewery,amenity:pub,amenity:bar", "brewery", "pub"],
  cafe: ["amenity:cafe", "cafe"],
  restaurant: ["amenity:restaurant", "restaurant"],
  gym: ["gym", "fitness_centre", "sports_centre", "leisure:fitness_centre", "amenity:gym"],
  mall: ["shop:mall", "mall"],
  custom: ["amenity:restaurant,amenity:cafe", "restaurant", "cafe"],
};

type LocationIqNearbyPlace = {
  place_id?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
};

async function fetchNearbyPlaces(apiKey: string, lat: number, lng: number, tags: string[]) {
  let lastError = "LocationIQ nearby search failed.";

  for (const tag of tags) {
    const params = new URLSearchParams({
      key: apiKey,
      lat: String(lat),
      lon: String(lng),
      tag,
      radius: "5000",
      format: "json",
      limit: "10",
    });

    const response = await fetch(`https://us1.locationiq.com/v1/nearby?${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      lastError = `LocationIQ nearby search failed: ${errorText}`;

      if (errorText.toLowerCase().includes("unable to geocode")) {
        continue;
      }

      return { ok: false as const, error: lastError };
    }

    const data = (await response.json()) as LocationIqNearbyPlace[];
    if (data.length > 0) {
      return { ok: true as const, data, tag };
    }
  }

  return { ok: false as const, error: lastError };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.LOCATIONIQ_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing LOCATIONIQ_API_KEY. Add it to your environment before using LocationIQ." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as {
    lat?: number;
    lng?: number;
    category?: string;
  };

  if (typeof body.lat !== "number" || typeof body.lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
  }

  const tags = categoryToTags[body.category || "custom"] || categoryToTags.custom;

  try {
    const result = await fetchNearbyPlaces(apiKey, body.lat, body.lng, tags);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    const data = result.data;

    const places = data
      .map((place) => {
        const lat = Number(place.lat);
        const lng = Number(place.lon);

        if (!place.place_id || Number.isNaN(lat) || Number.isNaN(lng)) {
          return null;
        }

        return {
          placeId: String(place.place_id),
          name: place.display_name?.split(",")[0] || "Unnamed place",
          address: place.display_name || "",
          type: place.type || body.category || "custom",
          lat,
          lng,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ places });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach LocationIQ nearby search." },
      { status: 500 },
    );
  }
}

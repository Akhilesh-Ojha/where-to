import { NextRequest, NextResponse } from "next/server";
import { rankPlaces, type SuggestedPlace } from "@/lib/destinations";
import { getPlan, savePlanDestinations, type CategoryId } from "@/lib/plans";

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

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const apiKey = process.env.LOCATIONIQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing LOCATIONIQ_API_KEY. Add it to your environment before using LocationIQ." },
        { status: 500 },
      );
    }

    const { id } = await context.params;
    const plan = await getPlan(id);

    if (!plan) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    }

    if (plan.participants.length < 2) {
      return NextResponse.json(
        { error: "At least two participants are required before finding destinations." },
        { status: 400 },
      );
    }

    const midpoint = plan.participants.reduce(
      (sum, participant) => {
        sum.lat += participant.location.lat;
        sum.lng += participant.location.lng;
        return sum;
      },
      { lat: 0, lng: 0 },
    );

    const center = {
      lat: midpoint.lat / plan.participants.length,
      lng: midpoint.lng / plan.participants.length,
    };

    const tags = categoryToTags[plan.category as CategoryId] || categoryToTags.custom;
    const result = await fetchNearbyPlaces(apiKey, center.lat, center.lng, tags);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    const data = result.data;
    const places: SuggestedPlace[] = data
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
          type: place.type || plan.category,
          lat,
          lng,
        };
      })
      .filter(Boolean) as SuggestedPlace[];

    const destinations = rankPlaces(places, plan.participants);
    const updatedPlan = await savePlanDestinations(id, destinations);

    return NextResponse.json({ plan: updatedPlan, destinations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch nearby destinations." },
      { status: 500 },
    );
  }
}

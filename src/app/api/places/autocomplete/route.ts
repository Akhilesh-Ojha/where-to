import { NextRequest, NextResponse } from "next/server";

type LocationIqPlace = {
  place_id?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    name?: string;
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
  };
};

function buildSecondaryText(place: LocationIqPlace) {
  const address = place.address;

  if (!address) {
    return "";
  }

  return [
    address.road,
    address.suburb || address.neighbourhood,
    address.city || address.town || address.village,
    address.state,
  ]
    .filter(Boolean)
    .join(", ");
}

function buildPrimaryText(place: LocationIqPlace) {
  const address = place.address;

  return (
    address?.name ||
    address?.road ||
    address?.suburb ||
    address?.neighbourhood ||
    place.display_name?.split(",")[0] ||
    "Unnamed place"
  );
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
    input?: string;
  };

  const input = body.input?.trim();

  if (!input || input.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const params = new URLSearchParams({
    key: apiKey,
    q: input,
    format: "json",
    normalizecity: "1",
    addressdetails: "1",
    countrycodes: "in",
    limit: "5",
  });

  try {
    const response = await fetch(`https://api.locationiq.com/v1/autocomplete?${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `LocationIQ autocomplete failed: ${errorText}` },
        { status: response.status },
      );
    }

    const data = (await response.json()) as LocationIqPlace[];

    const suggestions = data
      .map((place) => {
        const lat = Number(place.lat);
        const lng = Number(place.lon);

        if (!place.place_id || Number.isNaN(lat) || Number.isNaN(lng)) {
          return null;
        }

        return {
          placeId: String(place.place_id),
          text: buildPrimaryText(place),
          secondaryText: buildSecondaryText(place) || place.display_name || "",
          lat,
          lng,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach LocationIQ autocomplete." },
      { status: 500 },
    );
  }
}

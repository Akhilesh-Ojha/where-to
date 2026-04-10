import { NextRequest, NextResponse } from "next/server";
import { searchNearbyPlaces } from "@/lib/google-places";
import type { CategoryId } from "@/lib/categories";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    lat?: number;
    lng?: number;
    category?: CategoryId;
    subcategory?: string | null;
    subcategories?: string[];
  };

  if (typeof body.lat !== "number" || typeof body.lng !== "number") {
    return NextResponse.json({ error: "lat and lng are required." }, { status: 400 });
  }

  try {
    const results = await searchNearbyPlaces({
      lat: body.lat,
      lng: body.lng,
      category: body.category || "restaurant",
      subcategory: body.subcategories?.[0] || body.subcategory || null,
      subcategories: body.subcategories?.slice(0, 3) || (body.subcategory ? [body.subcategory] : []),
      limit: 8,
    });

    const places = results.map((place) => ({
      placeId: place.placeId,
      name: place.text,
      address: place.secondaryText,
      type: place.type || body.category || "restaurant",
      lat: place.lat,
      lng: place.lng,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
    }));

    return NextResponse.json({ places });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reach Google Places nearby search." },
      { status: 500 },
    );
  }
}

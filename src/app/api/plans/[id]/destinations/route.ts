import { NextRequest, NextResponse } from "next/server";
import { rankPlaces, type SuggestedPlace } from "@/lib/destinations";
import { searchNearbyPlaces } from "@/lib/google-places";
import { getPlan, savePlanDestinations } from "@/lib/plans";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
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

    const results = await searchNearbyPlaces({
      lat: center.lat,
      lng: center.lng,
      category: plan.category,
      subcategory: plan.subcategory,
      limit: 10,
    });

    const places: SuggestedPlace[] = results.map((place) => ({
      placeId: place.placeId,
      name: place.text,
      address: place.secondaryText,
      type: place.type || plan.category,
      lat: place.lat,
      lng: place.lng,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
    }));

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

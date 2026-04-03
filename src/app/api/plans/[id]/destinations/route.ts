import { NextRequest, NextResponse } from "next/server";
import { getMaxParticipantDistanceKm, rankPlaces, type SuggestedPlace } from "@/lib/destinations";
import { searchNearbyPlaces } from "@/lib/google-places";
import { getPlan, savePlanDestinations } from "@/lib/plans";
import { consumeShortWindowRateLimit, getRequestIpAddress } from "@/lib/rate-limit";

const LOCAL_MEETUP_MAX_DISTANCE_KM = 80;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await consumeShortWindowRateLimit({
      scope: "destinations",
      identifier: getRequestIpAddress(request.headers),
    });

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

    const maxParticipantDistanceKm = getMaxParticipantDistanceKm(plan.participants);

    if (maxParticipantDistanceKm > LOCAL_MEETUP_MAX_DISTANCE_KM) {
      return NextResponse.json(
        {
          error:
            "This group is spread too far apart for a local meetup right now. Long-distance meetups are coming soon.",
        },
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
      photoUrls: place.photoUrls,
    }));

    const destinations = rankPlaces(places, plan.participants);
    const updatedPlan = await savePlanDestinations(id, destinations);

    return NextResponse.json({ plan: updatedPlan, destinations });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch nearby destinations.";
    const status = message.includes("Too many destination fetches right now") ? 429 : 500;
    return NextResponse.json(
      { error: message },
      { status },
    );
  }
}

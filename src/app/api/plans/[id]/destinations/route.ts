import { NextRequest, NextResponse } from "next/server";
import {
  findLocalMeetupCluster,
  getMaxParticipantDistanceKm,
  rankPlaces,
  type SuggestedPlace,
} from "@/lib/destinations";
import { searchNearbyPlaces } from "@/lib/google-places";
import { getPlan, savePlanDestinations } from "@/lib/plans";
import { consumeShortWindowRateLimit, getRequestIpAddress } from "@/lib/rate-limit";

const LOCAL_MEETUP_MAX_DISTANCE_KM = 80;
const LOCAL_CLUSTER_RADIUS_KM = 40;

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
    const { cluster, excluded } = findLocalMeetupCluster(
      plan.participants,
      LOCAL_CLUSTER_RADIUS_KM,
    );
    const requiredClusterSize =
      plan.participants.length <= 3
        ? plan.participants.length
        : Math.max(plan.participants.length - 1, Math.ceil(plan.participants.length * 0.7));

    if (
      maxParticipantDistanceKm > LOCAL_MEETUP_MAX_DISTANCE_KM &&
      cluster.length < requiredClusterSize
    ) {
      return NextResponse.json(
        {
          error:
            "This group is spread too far apart for a local meetup right now. Long-distance meetups are coming soon.",
        },
        { status: 400 },
      );
    }

    const activeParticipants =
      excluded.length > 0 && cluster.length >= requiredClusterSize ? cluster : plan.participants;

    const center = {
      lat:
        activeParticipants.reduce((sum, participant) => sum + participant.location.lat, 0) /
        activeParticipants.length,
      lng:
        activeParticipants.reduce((sum, participant) => sum + participant.location.lng, 0) /
        activeParticipants.length,
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

    const destinations = rankPlaces(places, activeParticipants);
    const updatedPlan = await savePlanDestinations(id, destinations);

    const message =
      activeParticipants.length !== plan.participants.length
        ? `${excluded.length} participant${excluded.length > 1 ? "s are" : " is"} much farther than the main group, so results are optimized for the local cluster.`
        : undefined;

    return NextResponse.json({ plan: updatedPlan, destinations, message });
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

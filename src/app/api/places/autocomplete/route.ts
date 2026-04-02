import { NextRequest, NextResponse } from "next/server";
import { searchPlacesByText } from "@/lib/google-places";
import { consumeShortWindowRateLimit, getRequestIpAddress } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    input?: string;
    locationBias?: {
      latitude?: number;
      longitude?: number;
    };
  };

  const input = body.input?.trim();

  if (!input || input.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    await consumeShortWindowRateLimit({
      scope: "autocomplete",
      identifier: getRequestIpAddress(request.headers),
    });

    const suggestions = await searchPlacesByText({
      query: input,
      lat: body.locationBias?.latitude,
      lng: body.locationBias?.longitude,
      limit: 10,
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reach Google Places text search.";
    const status = message.includes("Too many place searches right now") ? 429 : 500;
    return NextResponse.json(
      { error: message },
      { status },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { searchPlacesByText } from "@/lib/google-places";

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
    const suggestions = await searchPlacesByText({
      query: input,
      lat: body.locationBias?.latitude,
      lng: body.locationBias?.longitude,
      limit: 10,
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reach Google Places text search." },
      { status: 500 },
    );
  }
}

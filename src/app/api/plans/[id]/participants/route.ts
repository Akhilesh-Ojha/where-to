import { NextRequest, NextResponse } from "next/server";
import { addParticipantToPlan, type SavedLocation } from "@/lib/plans";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      location?: SavedLocation;
    };

    if (!body.name?.trim() || !body.location) {
      return NextResponse.json({ error: "name and location are required." }, { status: 400 });
    }

    const result = await addParticipantToPlan(id, {
      name: body.name.trim(),
      location: body.location,
    });

    if (!result) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not join this plan right now.";
    const status =
      message.includes("nearby meetups only") || message.includes("Long-distance meetup mode")
        ? 400
        : 500;

    return NextResponse.json(
      { error: message },
      { status },
    );
  }
}

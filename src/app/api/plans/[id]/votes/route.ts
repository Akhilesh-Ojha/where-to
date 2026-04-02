import { NextRequest, NextResponse } from "next/server";
import { saveParticipantVote } from "@/lib/plans";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      participantId?: string;
      destinationPlaceId?: string;
    };

    if (!body.participantId?.trim() || !body.destinationPlaceId?.trim()) {
      return NextResponse.json(
        { error: "participantId and destinationPlaceId are required." },
        { status: 400 },
      );
    }

    const plan = await saveParticipantVote(id, {
      participantId: body.participantId.trim(),
      destinationPlaceId: body.destinationPlaceId.trim(),
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    }

    return NextResponse.json({ plan }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save your vote right now." },
      { status: 500 },
    );
  }
}

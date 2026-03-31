import { NextRequest, NextResponse } from "next/server";
import { createPlan, type CategoryId, type SavedLocation } from "@/lib/plans";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      groupName?: string;
      category?: CategoryId;
      createdBy?: string;
      hostLocation?: SavedLocation;
    };

    if (!body.groupName?.trim() || !body.createdBy?.trim() || !body.hostLocation || !body.category) {
      return NextResponse.json(
        { error: "groupName, createdBy, category, and hostLocation are required." },
        { status: 400 },
      );
    }

    const plan = await createPlan({
      groupName: body.groupName.trim(),
      category: body.category,
      createdBy: body.createdBy.trim(),
      hostLocation: body.hostLocation,
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the plan right now." },
      { status: 500 },
    );
  }
}

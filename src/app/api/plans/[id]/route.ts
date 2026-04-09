import { NextRequest, NextResponse } from "next/server";
import { getPlan, updatePlanCategory } from "@/lib/plans";
import type { CategoryId } from "@/lib/categories";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const plan = await getPlan(id);

    if (!plan) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load the plan right now." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      participantId?: string;
      category?: CategoryId;
      subcategories?: string[];
    };

    if (!body.participantId?.trim() || !body.category) {
      return NextResponse.json(
        { error: "participantId and category are required." },
        { status: 400 },
      );
    }

    const plan = await updatePlanCategory(id, {
      participantId: body.participantId.trim(),
      category: body.category,
      subcategories: (body.subcategories || []).slice(0, 3),
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not update this plan right now.";

    return NextResponse.json(
      { error: message },
      { status: message.includes("Only the host") ? 403 : 500 },
    );
  }
}

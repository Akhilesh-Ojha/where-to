import { NextRequest, NextResponse } from "next/server";
import { createPlan, type SavedLocation } from "@/lib/plans";
import type { CategoryId } from "@/lib/categories";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      groupName?: string;
      category?: CategoryId;
      subcategory?: string | null;
      subcategories?: string[];
      createdBy?: string;
      hostLocation?: SavedLocation;
    };

    if (!body.groupName?.trim() || !body.createdBy?.trim() || !body.hostLocation || !body.category) {
      return NextResponse.json(
        { error: "groupName, createdBy, category, and hostLocation are required." },
        { status: 400 },
      );
    }

    const result = await createPlan({
      groupName: body.groupName.trim(),
      category: body.category,
      subcategory: body.subcategories?.[0] || body.subcategory || null,
      subcategories: body.subcategories?.slice(0, 3) || (body.subcategory ? [body.subcategory] : []),
      createdBy: body.createdBy.trim(),
      hostLocation: body.hostLocation,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the plan right now." },
      { status: 500 },
    );
  }
}

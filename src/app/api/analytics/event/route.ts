import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      eventName?: string;
      planId?: string | null;
      participantId?: string | null;
      metadata?: unknown;
    };

    const eventName = body.eventName?.trim();

    if (!eventName) {
      return NextResponse.json({ error: "eventName is required." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("analytics_events").insert({
      event_name: eventName,
      plan_id: body.planId || null,
      participant_id: body.participantId || null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not record analytics event." },
      { status: 500 },
    );
  }
}


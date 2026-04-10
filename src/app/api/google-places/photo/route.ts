import { NextRequest, NextResponse } from "next/server";
import { fetchPhotoUri } from "@/lib/google-places";

export async function GET(request: NextRequest) {
  const photoName = request.nextUrl.searchParams.get("photoName");

  if (!photoName) {
    return NextResponse.json({ error: "Missing photoName parameter." }, { status: 400 });
  }

  try {
    const photoUrl = await fetchPhotoUri(photoName);

    if (!photoUrl) {
      return NextResponse.json({ error: "Photo not available." }, { status: 404 });
    }

    return NextResponse.json({ photoUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch photo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

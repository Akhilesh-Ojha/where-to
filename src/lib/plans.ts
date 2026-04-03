import { getSupabaseAdmin } from "@/lib/supabase-server";
import type { CategoryId } from "@/lib/categories";

const PLAN_TTL_HOURS = 24;

export type SavedLocation =
  | {
      mode: "gps";
      label: string;
      address: string;
      lat: number;
      lng: number;
    }
  | {
      mode: "manual";
      label: string;
      address: string;
      lat: number;
      lng: number;
      placeId: string;
    };

export type ParticipantRecord = {
  id: string;
  name: string;
  joinedAt: string;
  location: SavedLocation;
};

export type DestinationDistance = {
  participantId: string;
  participantName: string;
  distanceKm: number;
};

export type DestinationRecord = {
  placeId: string;
  name: string;
  address: string;
  type: string;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingCount: number | null;
  photoUrls: string[];
  fairness: number;
  averageDistanceKm: number;
  distances: DestinationDistance[];
  voteCount: number;
};

export type VoteRecord = {
  participantId: string;
  destinationPlaceId: string;
  createdAt: string;
};

export type PlanRecord = {
  id: string;
  groupName: string;
  category: CategoryId;
  subcategory: string | null;
  createdBy: string;
  createdAt: string;
  hostLocation: SavedLocation;
  participants: ParticipantRecord[];
  destinations: DestinationRecord[];
  votes: VoteRecord[];
};

type PlanRow = {
  id: string;
  group_name: string;
  category: CategoryId;
  subcategory: string | null;
  created_by: string;
  created_at: string;
  host_location: SavedLocation;
};

type ParticipantRow = {
  id: string;
  plan_id: string;
  name: string;
  joined_at: string;
  location: SavedLocation;
};

type DestinationRow = {
  plan_id: string;
  sort_order: number;
  place_id: string;
  name: string;
  address: string;
  type: string;
  lat: number;
  lng: number;
  rating: number | null;
  user_rating_count: number | null;
  photo_urls: string[];
  fairness: number;
  average_distance_km: number;
  distances: DestinationDistance[];
};

type VoteRow = {
  plan_id: string;
  participant_id: string;
  destination_place_id: string;
  created_at: string;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function buildPlanId(groupName: string) {
  const slug = slugify(groupName);
  return slug ? `${slug}-${Math.random().toString(36).slice(2, 6)}` : "meetfair-demo";
}

function createParticipantId(name: string) {
  const slug = slugify(name);
  return `${slug || "guest"}-${Math.random().toString(36).slice(2, 6)}`;
}

function getPlanExpiryCutoffIso() {
  return new Date(Date.now() - PLAN_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

function isExpired(createdAt: string) {
  return new Date(createdAt).getTime() < Date.now() - PLAN_TTL_HOURS * 60 * 60 * 1000;
}

function mapPlanRecord(
  plan: PlanRow,
  participants: ParticipantRow[],
  destinations: DestinationRow[],
  votes: VoteRow[],
): PlanRecord {
  const voteCounts = votes.reduce<Record<string, number>>((counts, vote) => {
    counts[vote.destination_place_id] = (counts[vote.destination_place_id] || 0) + 1;
    return counts;
  }, {});

  return {
    id: plan.id,
    groupName: plan.group_name,
    category: plan.category,
    subcategory: plan.subcategory,
    createdBy: plan.created_by,
    createdAt: plan.created_at,
    hostLocation: plan.host_location,
    participants: participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      joinedAt: participant.joined_at,
      location: participant.location,
    })),
    destinations: destinations.map((destination) => ({
      placeId: destination.place_id,
      name: destination.name,
      address: destination.address,
      type: destination.type,
      lat: destination.lat,
      lng: destination.lng,
      rating: destination.rating,
      userRatingCount: destination.user_rating_count,
      photoUrls: destination.photo_urls || [],
      fairness: destination.fairness,
      averageDistanceKm: destination.average_distance_km,
      distances: destination.distances,
      voteCount: voteCounts[destination.place_id] || 0,
    })),
    votes: votes.map((vote) => ({
      participantId: vote.participant_id,
      destinationPlaceId: vote.destination_place_id,
      createdAt: vote.created_at,
    })),
  };
}

export async function createPlan(input: {
  groupName: string;
  category: CategoryId;
  subcategory?: string | null;
  createdBy: string;
  hostLocation: SavedLocation;
}) {
  const supabase = getSupabaseAdmin();
  const id = buildPlanId(input.groupName);
  const createdAt = new Date().toISOString();

  const hostParticipant: ParticipantRecord = {
    id: createParticipantId(input.createdBy),
    name: input.createdBy,
    joinedAt: createdAt,
    location: input.hostLocation,
  };

  const { error: planError } = await supabase.from("plans").insert({
    id,
    group_name: input.groupName,
    category: input.category,
    subcategory: input.subcategory || null,
    created_by: input.createdBy,
    created_at: createdAt,
    host_location: input.hostLocation,
  });

  if (planError) {
    throw new Error(planError.message);
  }

  const { error: participantError } = await supabase.from("participants").insert({
    id: hostParticipant.id,
    plan_id: id,
    name: hostParticipant.name,
    joined_at: hostParticipant.joinedAt,
    location: hostParticipant.location,
  });

  if (participantError) {
    throw new Error(participantError.message);
  }

  void cleanupExpiredPlans().catch(() => undefined);

  const plan: PlanRecord = {
    id,
    groupName: input.groupName,
    category: input.category,
    subcategory: input.subcategory || null,
    createdBy: input.createdBy,
    createdAt,
    hostLocation: input.hostLocation,
    participants: [hostParticipant],
    destinations: [],
    votes: [],
  };

  return { plan, participant: hostParticipant };
}

export async function getPlan(planId: string) {
  const supabase = getSupabaseAdmin();

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, group_name, category, subcategory, created_by, created_at, host_location")
    .eq("id", planId)
    .maybeSingle();

  if (planError) {
    throw new Error(planError.message);
  }

  const normalizedPlan = (plan as PlanRow | null) || null;

  if (!normalizedPlan) {
    return null;
  }

  if (isExpired(normalizedPlan.created_at)) {
    await supabase.from("plans").delete().eq("id", planId);
    return null;
  }

  const [
    { data: participants, error: participantsError },
    { data: destinations, error: destinationsError },
    { data: votes, error: votesError },
  ] =
    await Promise.all([
      supabase
        .from("participants")
        .select("id, plan_id, name, joined_at, location")
        .eq("plan_id", planId)
        .order("joined_at", { ascending: true })
        .returns<ParticipantRow[]>(),
      supabase
        .from("destinations")
        .select(
          "plan_id, sort_order, place_id, name, address, type, lat, lng, rating, user_rating_count, photo_urls, fairness, average_distance_km, distances",
        )
        .eq("plan_id", planId)
        .order("sort_order", { ascending: true })
        .returns<DestinationRow[]>(),
      supabase
        .from("destination_votes")
        .select("plan_id, participant_id, destination_place_id, created_at")
        .eq("plan_id", planId)
        .returns<VoteRow[]>(),
    ]);

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  if (destinationsError) {
    throw new Error(destinationsError.message);
  }

  if (votesError) {
    throw new Error(votesError.message);
  }

  return mapPlanRecord(
    normalizedPlan,
    (participants as ParticipantRow[] | null) || [],
    (destinations as DestinationRow[] | null) || [],
    (votes as VoteRow[] | null) || [],
  );
}

export async function addParticipantToPlan(
  planId: string,
  input: { name: string; location: SavedLocation },
) {
  const supabase = getSupabaseAdmin();
  const plan = await getPlan(planId);

  if (!plan) {
    return null;
  }

  const participant: ParticipantRecord = {
    id: createParticipantId(input.name),
    name: input.name,
    joinedAt: new Date().toISOString(),
    location: input.location,
  };

  const { error } = await supabase.from("participants").insert({
    id: participant.id,
    plan_id: planId,
    name: participant.name,
    joined_at: participant.joinedAt,
    location: participant.location,
  });

  if (error) {
    if (error.code === "23503") {
      return null;
    }

    throw new Error(error.message);
  }

  const updatedPlan = await getPlan(planId);

  if (!updatedPlan) {
    return null;
  }

  return { plan: updatedPlan, participant };
}

export async function savePlanDestinations(planId: string, destinations: DestinationRecord[]) {
  const supabase = getSupabaseAdmin();
  const plan = await getPlan(planId);

  if (!plan) {
    return null;
  }

  const { error: deleteError } = await supabase.from("destinations").delete().eq("plan_id", planId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: deleteVotesError } = await supabase.from("destination_votes").delete().eq("plan_id", planId);

  if (deleteVotesError) {
    throw new Error(deleteVotesError.message);
  }

  if (destinations.length > 0) {
    const rows = destinations.map((destination, index) => ({
      plan_id: planId,
      sort_order: index,
      place_id: destination.placeId,
      name: destination.name,
      address: destination.address,
      type: destination.type,
      lat: destination.lat,
      lng: destination.lng,
      rating: destination.rating,
      user_rating_count: destination.userRatingCount,
      photo_urls: destination.photoUrls,
      fairness: destination.fairness,
      average_distance_km: destination.averageDistanceKm,
      distances: destination.distances,
    }));

    const { error: insertError } = await supabase.from("destinations").insert(rows);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return getPlan(planId);
}

export async function cleanupExpiredPlans() {
  const supabase = getSupabaseAdmin();
  const cutoff = getPlanExpiryCutoffIso();

  const { error } = await supabase.from("plans").delete().lt("created_at", cutoff);

  if (error) {
    throw new Error(error.message);
  }
}

export async function saveParticipantVote(
  planId: string,
  input: { participantId: string; destinationPlaceId: string },
) {
  const supabase = getSupabaseAdmin();
  const plan = await getPlan(planId);

  if (!plan) {
    return null;
  }

  const participantExists = plan.participants.some((participant) => participant.id === input.participantId);

  if (!participantExists) {
    throw new Error("Only joined participants can vote.");
  }

  const destinationExists = plan.destinations.some((destination) => destination.placeId === input.destinationPlaceId);

  if (!destinationExists) {
    throw new Error("Destination not found for this plan.");
  }

  const { error } = await supabase.from("destination_votes").upsert(
    {
      plan_id: planId,
      participant_id: input.participantId,
      destination_place_id: input.destinationPlaceId,
      created_at: new Date().toISOString(),
    },
    { onConflict: "plan_id,participant_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  return getPlan(planId);
}

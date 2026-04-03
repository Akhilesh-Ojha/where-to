import type { DestinationRecord, ParticipantRecord } from "@/lib/plans";

export type SuggestedPlace = {
  placeId: string;
  name: string;
  address: string;
  type: string;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingCount: number | null;
  photoUrls: string[];
};

export function formatCoords(lat: number, lng: number) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function buildMapUrl(lat: number, lng: number, label?: string) {
  const query = label ? encodeURIComponent(`${label} ${lat},${lng}`) : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function haversineDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export function getMaxParticipantDistanceKm(participants: ParticipantRecord[]) {
  let maxDistanceKm = 0;

  for (let index = 0; index < participants.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < participants.length; compareIndex += 1) {
      const distanceKm = haversineDistanceKm(
        {
          lat: participants[index].location.lat,
          lng: participants[index].location.lng,
        },
        {
          lat: participants[compareIndex].location.lat,
          lng: participants[compareIndex].location.lng,
        },
      );

      maxDistanceKm = Math.max(maxDistanceKm, distanceKm);
    }
  }

  return maxDistanceKm;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function rankPlaces(
  places: SuggestedPlace[],
  participants: ParticipantRecord[],
): DestinationRecord[] {
  const centroid = participants.reduce(
    (sum, participant) => {
      sum.lat += participant.location.lat;
      sum.lng += participant.location.lng;
      return sum;
    },
    { lat: 0, lng: 0 },
  );

  const groupCenter = {
    lat: centroid.lat / participants.length,
    lng: centroid.lng / participants.length,
  };

  const groupSpreadKm = participants.reduce((largest, participant) => {
    const distanceFromCenter = haversineDistanceKm(
      { lat: participant.location.lat, lng: participant.location.lng },
      groupCenter,
    );

    return Math.max(largest, distanceFromCenter);
  }, 0);

  const targetAverageDistanceKm = Math.max(1.5, groupSpreadKm * 1.75 + 0.75);
  const targetFairnessGapKm = Math.max(0.75, groupSpreadKm * 0.85 + 0.5);
  const closenessWeight = groupSpreadKm <= 2 ? 0.72 : groupSpreadKm <= 5 ? 0.6 : 0.48;
  const fairnessWeight = 1 - closenessWeight;
  const fairnessToleranceKm = Math.max(1.25, groupSpreadKm * 0.45 + 0.75);
  const maxDistanceToleranceKm = Math.max(3, groupSpreadKm * 1.2 + 1.5);

  return places
    .map((place) => {
      const distances = participants.map((participant) => {
        const distanceKm = haversineDistanceKm(
          { lat: participant.location.lat, lng: participant.location.lng },
          { lat: place.lat, lng: place.lng },
        );

        return {
          participantId: participant.id,
          participantName: participant.name,
          distanceKm,
        };
      });

      const values = distances.map((distance) => distance.distanceKm);
      const maxDistance = Math.max(...values);
      const minDistance = Math.min(...values);
      const fairnessGapKm = maxDistance - minDistance;
      const averageDistanceKm =
        values.reduce((sum, value) => sum + value, 0) / values.length;
      const adjustedFairnessGapKm = Math.max(0, fairnessGapKm - fairnessToleranceKm);
      const adjustedMaxDistanceKm = Math.max(0, maxDistance - maxDistanceToleranceKm);
      const closenessScore = clamp(
        100 - (averageDistanceKm / targetAverageDistanceKm) * 70,
        0,
        100,
      );
      const balanceScore = clamp(
        100 - (adjustedFairnessGapKm / targetFairnessGapKm) * 100,
        0,
        100,
      );
      const extremeTravelPenalty = clamp(
        (adjustedMaxDistanceKm / Math.max(1, targetAverageDistanceKm)) * 18,
        0,
        100,
      );
      const fairness = Math.round(
        clamp(
          closenessScore * closenessWeight + balanceScore * fairnessWeight - extremeTravelPenalty,
          0,
          100,
        ),
      );

      return {
        ...place,
        fairness,
        averageDistanceKm,
        distances,
        photoUrls: place.photoUrls,
        voteCount: 0,
      };
    })
    .sort((left, right) => {
      if (right.fairness !== left.fairness) {
        return right.fairness - left.fairness;
      }

      if ((right.rating || 0) !== (left.rating || 0)) {
        return (right.rating || 0) - (left.rating || 0);
      }

      return left.averageDistanceKm - right.averageDistanceKm;
    })
    .slice(0, 10);
}

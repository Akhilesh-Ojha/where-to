import type { DestinationRecord, ParticipantRecord } from "@/lib/plans";

export type SuggestedPlace = {
  placeId: string;
  name: string;
  address: string;
  type: string;
  lat: number;
  lng: number;
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

export function rankPlaces(
  places: SuggestedPlace[],
  participants: ParticipantRecord[],
): DestinationRecord[] {
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
      const averageDistanceKm =
        values.reduce((sum, value) => sum + value, 0) / values.length;
      const fairness = Math.max(0, Math.round(100 - (maxDistance - minDistance) * 8));

      return {
        ...place,
        fairness,
        averageDistanceKm,
        distances,
      };
    })
    .sort((left, right) => {
      if (right.fairness !== left.fairness) {
        return right.fairness - left.fairness;
      }

      return left.averageDistanceKm - right.averageDistanceKm;
    })
    .slice(0, 5);
}

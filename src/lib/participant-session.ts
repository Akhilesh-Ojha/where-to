const PARTICIPANT_STORAGE_PREFIX = "meetfair-participant:";

function getParticipantStorageKey(planId: string) {
  return `${PARTICIPANT_STORAGE_PREFIX}${planId}`;
}

export function getStoredParticipantId(planId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(getParticipantStorageKey(planId));
}

export function storeParticipantId(planId: string, participantId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getParticipantStorageKey(planId), participantId);
}

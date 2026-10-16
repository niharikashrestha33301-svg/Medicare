// Provider boundary. Keep this unavailable until an authorized integration exists.
// A future adapter must authenticate the requester, verify dispatch ownership,
// validate provider timestamps/coordinates, and reject stale or untrusted data.
// No client-submitted vehicle positions or availability are accepted here.
export function getAmbulanceTrackingStatus() {
  return {
    available: false,
    provider: null,
    vehicles: [],
    updatedAt: null,
    message: 'Live ambulance tracking unavailable'
  };
}

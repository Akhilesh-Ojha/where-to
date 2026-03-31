export const sampleParticipants = [
  { name: "Akhil", area: "Indiranagar", status: "ready" },
  { name: "Rahul", area: "HSR Layout", status: "ready" },
  { name: "Priya", area: "Koramangala", status: "pending" },
] as const;

export const sampleResults = [
  {
    name: "Arbor Taproom",
    vibe: "Craft beer, rooftop energy",
    fairness: 91,
    eta: "22 min average",
    highlight: "Best balance for east + south Bangalore",
  },
  {
    name: "Toit",
    vibe: "Reliable group favorite",
    fairness: 88,
    eta: "24 min average",
    highlight: "Strong ratings and easiest landmark to find",
  },
  {
    name: "Biergarten",
    vibe: "Open-air, bigger tables",
    fairness: 84,
    eta: "26 min average",
    highlight: "Good fallback when your group gets larger",
  },
] as const;

export const samplePlaceSuggestions = [
  {
    id: "indiranagar-12th-main",
    name: "12th Main, Indiranagar",
    address: "Indiranagar, Bengaluru",
    lat: 12.9719,
    lng: 77.6412,
  },
  {
    id: "koramangala-5th-block",
    name: "5th Block, Koramangala",
    address: "Koramangala, Bengaluru",
    lat: 12.9352,
    lng: 77.6245,
  },
  {
    id: "hsr-layout-sector-2",
    name: "Sector 2, HSR Layout",
    address: "HSR Layout, Bengaluru",
    lat: 12.9116,
    lng: 77.6474,
  },
  {
    id: "mg-road",
    name: "MG Road Metro",
    address: "Central Bengaluru",
    lat: 12.9756,
    lng: 77.605,
  },
  {
    id: "jp-nagar",
    name: "JP Nagar 4th Phase",
    address: "JP Nagar, Bengaluru",
    lat: 12.9105,
    lng: 77.5921,
  },
] as const;

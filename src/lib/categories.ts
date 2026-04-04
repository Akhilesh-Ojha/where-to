export type CategoryId =
  | "restaurant"
  | "pub"
  | "cafe"
  | "wellness"
  | "sports"
  | "shopping"
  | "movies"
  | "events";

export type CategoryFilterOption = {
  id: string;
  label: string;
  searchText: string;
};

export type CategoryDefinition = {
  id: CategoryId;
  label: string;
  summaryLabel: string;
  defaultSearchText: string;
  filters: CategoryFilterOption[];
};

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    id: "restaurant",
    label: "Restaurant",
    summaryLabel: "Restaurants",
    defaultSearchText: "restaurant",
    filters: [
      { id: "indian", label: "Indian", searchText: "indian restaurant" },
      { id: "chinese", label: "Chinese", searchText: "chinese restaurant" },
      { id: "italian", label: "Italian", searchText: "italian restaurant" },
      { id: "thai", label: "Thai", searchText: "thai restaurant" },
      { id: "japanese", label: "Japanese", searchText: "japanese restaurant" },
      { id: "mexican", label: "Mexican", searchText: "mexican restaurant" },
      { id: "vegetarian", label: "Vegetarian", searchText: "vegetarian restaurant" },
      { id: "vegan", label: "Vegan", searchText: "vegan restaurant" },
    ],
  },
  {
    id: "pub",
    label: "Nightlife",
    summaryLabel: "Nightlife",
    defaultSearchText: "pub",
    filters: [
      { id: "pub", label: "Pub", searchText: "pub" },
      { id: "bar", label: "Bar", searchText: "bar" },
      { id: "brewery", label: "Brewery", searchText: "brewery" },
      { id: "bar_and_grill", label: "Bar & Grill", searchText: "bar and grill" },
    ],
  },
  {
    id: "cafe",
    label: "Cafe",
    summaryLabel: "Cafes",
    defaultSearchText: "cafe",
    filters: [
      { id: "coffee", label: "Coffee", searchText: "coffee shop" },
      { id: "bakery", label: "Bakery", searchText: "bakery" },
      { id: "dessert", label: "Dessert", searchText: "dessert shop" },
      { id: "tea", label: "Tea House", searchText: "tea house" },
    ],
  },
  {
    id: "wellness",
    label: "Wellness",
    summaryLabel: "Wellness",
    defaultSearchText: "wellness center",
    filters: [
      { id: "gym", label: "Gym", searchText: "gym" },
      { id: "yoga", label: "Yoga", searchText: "yoga studio" },
      { id: "spa", label: "Spa", searchText: "spa" },
      { id: "swimming", label: "Swimming", searchText: "swimming pool" },
    ],
  },
  {
    id: "sports",
    label: "Sports",
    summaryLabel: "Sports",
    defaultSearchText: "sports complex",
    filters: [
      { id: "badminton", label: "Badminton", searchText: "badminton court" },
      { id: "football", label: "Football", searchText: "football turf" },
      { id: "cricket", label: "Cricket", searchText: "cricket turf" },
      { id: "basketball", label: "Basketball", searchText: "basketball court" },
      { id: "tennis", label: "Tennis", searchText: "tennis court" },
    ],
  },
  {
    id: "shopping",
    label: "Shopping",
    summaryLabel: "Shopping",
    defaultSearchText: "shopping mall",
    filters: [
      { id: "mall", label: "Mall", searchText: "shopping mall" },
      { id: "market", label: "Market", searchText: "market" },
      { id: "supermarket", label: "Supermarket", searchText: "supermarket" },
      { id: "department_store", label: "Department Store", searchText: "department store" },
    ],
  },
  {
    id: "movies",
    label: "Movies",
    summaryLabel: "Movies",
    defaultSearchText: "movie theater",
    filters: [
      { id: "movie_theater", label: "Theater", searchText: "movie theater" },
      { id: "multiplex", label: "Multiplex", searchText: "multiplex cinema" },
      { id: "imax", label: "IMAX", searchText: "imax theater" },
      { id: "indie", label: "Indie", searchText: "independent movie theater" },
    ],
  },
  {
    id: "events",
    label: "Activities",
    summaryLabel: "Activities",
    defaultSearchText: "events",
    filters: [
      { id: "cooking_classes", label: "Cooking Classes", searchText: "cooking classes" },
      { id: "workshops", label: "Workshops", searchText: "creative workshops" },
      { id: "live_music", label: "Live Music", searchText: "live music venue" },
      { id: "art_classes", label: "Art Classes", searchText: "art classes" },
      { id: "event_venue", label: "Event Spots", searchText: "event venue" },
    ],
  },
];

export function getCategoryDefinition(categoryId: CategoryId) {
  return CATEGORY_DEFINITIONS.find((category) => category.id === categoryId) || CATEGORY_DEFINITIONS[0];
}

export function getCategoryLabel(categoryId: CategoryId) {
  return getCategoryDefinition(categoryId).label;
}

export function getCategoryFilterLabel(categoryId: CategoryId, filterId: string | null | undefined) {
  if (!filterId) {
    return null;
  }

  const filter = getCategoryDefinition(categoryId).filters.find((entry) => entry.id === filterId);
  return filter?.label || null;
}

export function buildCategorySearchText(categoryId: CategoryId, filterId?: string | null) {
  const category = getCategoryDefinition(categoryId);

  if (!filterId) {
    return category.defaultSearchText;
  }

  return (
    category.filters.find((filter) => filter.id === filterId)?.searchText ||
    category.defaultSearchText
  );
}

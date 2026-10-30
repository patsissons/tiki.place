import type { Place, PublishedPlace } from "../schema";

export function toPublished(place: Place): PublishedPlace {
  if (!place.location) throw new Error(`cannot publish ${place.id} without a location`);
  return {
    id: place.id,
    name: place.name,
    aliases: place.aliases,
    lat: place.location.lat,
    lng: place.location.lng,
    locality: place.address.locality,
    region: place.address.region,
    country: place.address.country,
    formattedAddress: place.formattedAddress,
    timezone: place.timezone,
    status: place.status.value,
    hours: place.hours,
    website: place.contact.website,
    phone: place.contact.phone,
    googleMapsUri: place.contact.googleMapsUri,
    rating: place.rating?.value,
    ratingCount: place.rating?.count,
    priceLevel: place.priceLevel,
    established: place.established,
    tikiConfidence: place.tikiConfidence,
    verified: Boolean(place.lastVerifiedAt),
    lastVerifiedAt: place.lastVerifiedAt,
    sources: place.sources
      .filter((s) => !s.missingSince)
      .map((s) => ({ id: s.sourceId, url: s.url })),
  };
}

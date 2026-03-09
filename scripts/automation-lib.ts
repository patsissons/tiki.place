import fs from "node:fs/promises";
import path from "node:path";

import { Octokit } from "@octokit/rest";
import tzLookup from "@photostructure/tz-lookup";

import { getDataPath } from "../lib/data";
import {
  parseTikiDataset,
  stringifyTikiDataset,
  type TikiBar,
  type TikiDataset,
} from "../lib/data-schema";
import { env, requireEnv } from "../lib/env";
import { slugify } from "../lib/utils";

type IssueFieldName = "Bar name" | "City" | "Country" | "Evidence URL" | "Notes" | "Place ID" | "Reason";

type ParsedIssueForm = Partial<Record<IssueFieldName, string>>;

type PlaceTextSearchResponse = {
  places?: GooglePlace[];
};

type PlaceDetailsResponse = GooglePlace;

type GooglePlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: Array<{
      open?: { day?: number; hour?: number; minute?: number };
      close?: { day?: number; hour?: number; minute?: number };
    }>;
  };
  businessStatus?: string;
  websiteUri?: string;
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
  types?: string[];
  primaryType?: string;
  nationalPhoneNumber?: string;
  editorialSummary?: { text: string };
  name?: string;
};

export const AUTOMATION_PROCESSED_LABEL = "automation:processed";
export const NEEDS_HUMAN_REVIEW_LABEL = "automation:needs-human-review";

function getOctokit() {
  const token = requireEnv(env.githubActionsToken ?? env.githubIssueToken, "GITHUB_ACTIONS_TOKEN");
  return new Octokit({ auth: token });
}

function getRepoCoordinates() {
  return {
    owner: requireEnv(env.githubRepoOwner, "GITHUB_REPO_OWNER"),
    repo: requireEnv(env.githubRepoName, "GITHUB_REPO_NAME"),
  };
}

export async function getIssue(issueNumber: number) {
  const octokit = getOctokit();
  const { owner, repo } = getRepoCoordinates();
  const response = await octokit.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });
  return response.data;
}

export async function commentOnIssue(issueNumber: number, body: string) {
  const octokit = getOctokit();
  const { owner, repo } = getRepoCoordinates();
  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}

export async function addLabels(issueNumber: number, labels: string[]) {
  const octokit = getOctokit();
  const { owner, repo } = getRepoCoordinates();
  await octokit.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels,
  });
}

export function parseIssueForm(body: string): ParsedIssueForm {
  const fields: IssueFieldName[] = [
    "Bar name",
    "City",
    "Country",
    "Evidence URL",
    "Notes",
    "Place ID",
    "Reason",
  ];

  return fields.reduce<ParsedIssueForm>((result, field) => {
    const pattern = new RegExp(`### ${field}\\n([\\s\\S]*?)(?=\\n### |$)`);
    const match = body.match(pattern);
    if (match?.[1]) {
      result[field] = match[1].trim().replace(/^_Not provided_$/i, "");
    }
    return result;
  }, {});
}

export async function loadDatasetFromDisk(): Promise<TikiDataset> {
  const content = await fs.readFile(getDataPath(), "utf8");
  return parseTikiDataset(content);
}

export async function saveDatasetToDisk(dataset: TikiDataset) {
  await fs.writeFile(getDataPath(), stringifyTikiDataset(dataset));
}

function getComponentText(place: GooglePlace, type: string) {
  const component = place.addressComponents?.find((entry) => entry.types?.includes(type));
  return component?.longText ?? "";
}

function formatGoogleTime(hour?: number, minute?: number) {
  return `${String(hour ?? 0).padStart(2, "0")}${String(minute ?? 0).padStart(2, "0")}`;
}

export function mapPlaceToBar(place: GooglePlace, previous?: TikiBar): TikiBar {
  if (!place.location || !place.displayName?.text || !place.formattedAddress || !place.googleMapsUri) {
    throw new Error("Google Place is missing required fields.");
  }

  const timeZone = tzLookup(place.location.latitude, place.location.longitude);

  return {
    placeId: place.id,
    slug: previous?.slug ?? slugify(`${place.displayName.text}-${getComponentText(place, "locality")}`),
    name: place.displayName.text,
    coordinates: {
      lat: place.location.latitude,
      lng: place.location.longitude,
    },
    formattedAddress: place.formattedAddress,
    address: {
      countryCode: getComponentText(place, "country") ? place.addressComponents?.find((entry) => entry.types?.includes("country"))?.shortText ?? "" : "",
      country: getComponentText(place, "country"),
      region:
        getComponentText(place, "administrative_area_level_1") || getComponentText(place, "administrative_area_level_2"),
      locality: getComponentText(place, "locality") || getComponentText(place, "postal_town"),
      postalCode: getComponentText(place, "postal_code"),
      streetAddress: [getComponentText(place, "street_number"), getComponentText(place, "route")].filter(Boolean).join(" "),
    },
    googleMapsUrl: place.googleMapsUri,
    rating: place.rating ?? 0,
    userRatingCount: place.userRatingCount ?? 0,
    weekdayText: place.regularOpeningHours?.weekdayDescriptions ?? [],
    openingPeriods:
      place.regularOpeningHours?.periods?.flatMap((period) => {
        if (!period.open || !period.close || period.open.day === undefined || period.close.day === undefined) {
          return [];
        }

        return [
          {
            open: {
              day: period.open.day,
              time: formatGoogleTime(period.open.hour, period.open.minute),
            },
            close: {
              day: period.close.day,
              time: formatGoogleTime(period.close.hour, period.close.minute),
            },
          },
        ];
      }) ?? [],
    timeZone,
    businessStatus: place.businessStatus ?? "UNKNOWN",
    websiteUrl: place.websiteUri,
    lastSyncedAt: new Date().toISOString(),
  };
}

function buildPlacesHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": requireEnv(env.googlePlacesApiKey, "GOOGLE_PLACES_API_KEY"),
    "X-Goog-FieldMask":
      "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.rating,places.userRatingCount,places.regularOpeningHours,places.businessStatus,places.websiteUri,places.addressComponents,places.types,places.primaryType,places.editorialSummary",
  };
}

export async function searchPlaces(textQuery: string) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: buildPlacesHeaders(),
    body: JSON.stringify({
      textQuery,
      pageSize: 5,
      languageCode: "en",
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Places search failed with ${response.status}.`);
  }

  const result = (await response.json()) as PlaceTextSearchResponse;
  return result.places ?? [];
}

export async function getPlaceDetails(placeId: string) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": requireEnv(env.googlePlacesApiKey, "GOOGLE_PLACES_API_KEY"),
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,location,googleMapsUri,rating,userRatingCount,regularOpeningHours,businessStatus,websiteUri,addressComponents,types,primaryType,editorialSummary",
    },
  });

  if (!response.ok) {
    throw new Error(`Google Place details failed with ${response.status}.`);
  }

  return (await response.json()) as PlaceDetailsResponse;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function chooseUniquePlaceMatch(
  submittedName: string,
  city: string,
  country: string,
  places: GooglePlace[],
) {
  if (places.length === 0) {
    return {
      place: null,
      reason: "No Google Places result matched the submitted details.",
    };
  }

  const normalizedName = normalize(submittedName);
  const normalizedCity = normalize(city);
  const normalizedCountry = normalize(country);

  const likelyMatches = places.filter((place) => {
    const placeName = normalize(place.displayName?.text ?? "");
    const address = normalize(place.formattedAddress ?? "");
    return (
      placeName.includes(normalizedName) &&
      address.includes(normalizedCity) &&
      address.includes(normalizedCountry)
    );
  });

  const exactPool = likelyMatches.length > 0 ? likelyMatches : places;
  const uniqueIds = new Set(exactPool.map((place) => place.id));

  if (uniqueIds.size !== 1) {
    return {
      place: null,
      reason: `Multiple candidate places were found for "${submittedName}" in ${city}, ${country}.`,
    };
  }

  return {
    place: exactPool[0] ?? null,
    reason: null,
  };
}

export function upsertBar(dataset: TikiDataset, nextBar: TikiBar) {
  const existingIndex = dataset.bars.findIndex((bar) => bar.placeId === nextBar.placeId);
  if (existingIndex >= 0) {
    dataset.bars[existingIndex] = {
      ...dataset.bars[existingIndex],
      ...nextBar,
      slug: dataset.bars[existingIndex]?.slug ?? nextBar.slug,
    };
  } else {
    dataset.bars.push(nextBar);
  }

  dataset.bars.sort((a, b) => a.name.localeCompare(b.name));
  return dataset;
}

export function summarizePlace(place: GooglePlace) {
  return [
    `- Name: ${place.displayName?.text ?? "Unknown"}`,
    `- Address: ${place.formattedAddress ?? "Unknown"}`,
    `- Primary type: ${place.primaryType ?? "Unknown"}`,
    `- Rating: ${place.rating ?? "n/a"} from ${place.userRatingCount ?? 0} reviews`,
    `- Website: ${place.websiteUri ?? "n/a"}`,
  ].join("\n");
}

export function evaluateBadReport(place: GooglePlace | null, reason: string) {
  if (!place) {
    return {
      recommendation: "accept",
      rationale: [
        "Google Places no longer returned a record for this Place ID.",
        `Reporter context: ${reason}`,
      ],
    };
  }

  const evidence = `${place.displayName?.text ?? ""} ${place.websiteUri ?? ""} ${place.editorialSummary?.text ?? ""}`.toLowerCase();
  const types = new Set([place.primaryType, ...(place.types ?? [])].filter(Boolean));

  const tikiSignals = ["tiki", "tropical"].some((signal) => evidence.includes(signal));
  const barSignals = ["bar", "cocktail_bar", "night_club"].some((signal) => types.has(signal));

  if (!tikiSignals && !barSignals) {
    return {
      recommendation: "accept",
      rationale: [
        "The current place metadata does not show clear tiki or bar-related signals.",
        `Reporter context: ${reason}`,
      ],
    };
  }

  if (tikiSignals && barSignals) {
    return {
      recommendation: "reject",
      rationale: [
        "The current Google Places data still shows tiki/bar evidence in the name, website, or type metadata.",
        `Reporter context: ${reason}`,
      ],
    };
  }

  return {
    recommendation: "manual-review",
    rationale: [
      "The available metadata is mixed and should be reviewed by a maintainer.",
      `Reporter context: ${reason}`,
    ],
  };
}

export async function commitSummary(message: string) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  await fs.appendFile(summaryPath, `${message}\n`);
}

export function getIssueNumberFromEnv() {
  const value = process.env.ISSUE_NUMBER;
  if (!value) {
    throw new Error("Missing ISSUE_NUMBER.");
  }

  return Number(value);
}

export function getRepoRoot() {
  return path.resolve(process.cwd());
}

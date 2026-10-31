/**
 * Tunables for the space backdrop drawn behind the globe.
 *
 * Time runs on two clocks on purpose. The sky's orientation (which stars sit
 * behind the Earth) follows the real clock, so it only drifts at the true
 * sidereal rate and stays calm. The Sun, Moon and planets follow a simulated
 * clock that starts at page load and runs fast, so the Moon visibly orbits and
 * cycles its phases. The two disagree by design; nothing on screen depends on
 * their difference.
 */

/** Simulated seconds per real second for the orbital clock: one day every 20 s. */
export const SIM_SECONDS_PER_REAL_SECOND = 86_400 / 20;
/** Apparent diameters of Sun, Moon and planets are scaled up by this much. Directions stay exact. */
export const BODY_MAGNIFICATION = 3;
/** Smallest disc diameter in CSS pixels, so distant planets still read as discs. */
export const MIN_BODY_PX = 6;
/** mapbox-gl's fixed vertical field of view (transform._fov). */
export const MAPBOX_FOV_RAD = 0.6435011087932844;
/** mapbox-gl's tile size; the globe's circumference in pixels is this times 2^zoom. */
export const MAPBOX_TILE_SIZE = 512;
/** World-unit distance of the celestial sphere; every body sits on it. */
export const SKY_RADIUS = 1000;
export const MAX_DPR = 2;
export const FRAME_INTERVAL_MS = 1000 / 30;
/** The backdrop pauses once the globe's radius exceeds this times the farthest corner distance. */
export const GLOBE_COVER_MARGIN = 1.08;

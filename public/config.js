/**
 * Everything on the site that isn't the draw or the wish lists.
 * Edit freely; no re-run of the generator needed.
 * Date and place are PLACEHOLDERS, replace them with your real details.
 */
export const SITE = {
  year: 2026,
  /** Shown as "Bescherung" on the landing page and the reveal. */
  date: '25. Dezember',
  /**
   * false: everyone sees the empty wish list ("Noch ganz leer."), whatever is already in data.json.
   * Set to true once the lists are complete (by wishDeadline); nobody needs a new password for that.
   */
  wishesOpen: true,
  /** By when every wish list is on the site (the editors' promise on an empty wish list). */
  wishDeadline: '1. Dezember',
  /** Spending limit in euros. Shown everywhere and used for the "Merkzettel". */
  budget: 50,
  /** A little over is fine: up to this many euros above the limit counts as "passt". */
  budgetTolerance: 3,
  /** Optional third line; set to '' to hide it. */
  place: 'Ort folgt',
  /** Who collects the wish lists. Shown as "Schick deine Wünsche an …". */
  organizer: 'Noah',
  /**
   * Optional: the organiser's WhatsApp number in international format without "+",
   * e.g. '491701234567'. Adds a "Wünsche schicken" button. Leave '' to hide it.
   * Note: this file is public on GitHub Pages.
   */
  organizerWhatsApp: '',
  /** Sound is on by default (it starts with the first tap); people can switch it off. */
  soundDefault: true,
};

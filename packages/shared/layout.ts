// How the app is laid out for the people who run it: the same in the dashboard and on the
// phone. Home first, then the tabs below, then More, which holds everything else (the other
// records, people and roles, activity, the trash, settings).
//
// Yours to edit: `nevela upgrade` never touches this file.

export interface LayoutSettings {
  /**
   * The tabs between Home and More.
   *
   * - "shop": the shop's orders and what it sells, found in your resources (an order whose
   *   lines point at what is sold). An app with no shop has a Records tab in their place.
   * - A list of resource names, in order, to choose them yourself: ["Booking", "Service"].
   */
  tabs: "shop" | string[];
}

export const layout: LayoutSettings = {
  tabs: "shop",
};

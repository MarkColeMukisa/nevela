// What the app is called, for both its apps: the dashboard (apps/web) and the phone app
// (apps/mobile) read it, so a new name is one change here. Yours to edit: `nevela upgrade`
// never touches this file.
//
// The name under the icon on a phone is `name` in apps/mobile/app.json, which the stores
// read; keep the two the same.

export const brand = {
  name: "Nevela",
  /** One line under the name: the sign-in screens and the home page show it. */
  tagline: "Your business, in one place",
};

export type Brand = typeof brand;

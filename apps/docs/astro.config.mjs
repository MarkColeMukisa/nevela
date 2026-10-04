// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const REPO = "https://github.com/MarkColeMukisa/nevela";

// A fully static site: `pnpm build` writes plain HTML to dist/, which any static host
// serves (Vercel, Cloudflare, Netlify, GitHub Pages). Set SITE_URL when building for a
// real domain so canonical links and the sitemap point at it.
// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  integrations: [
    starlight({
      title: "Nevela",
      description: "Nevela is a Laravel-first fullstack framework: describe a resource once and get a Laravel API and a Next.js dashboard.",
      social: [{ icon: "github", label: "GitHub", href: REPO }],
      customCss: ["@fontsource-variable/geist", "@fontsource-variable/geist-mono", "/src/styles/nevela-theme.css"],
      favicon: "/favicon.svg",
      components: {
        // Adds the version pill beside the site title.
        SiteTitle: "./src/components/SiteTitle.astro",
        // Reads the version from package.json, so it can't announce an old release.
        Banner: "./src/components/Banner.astro",
      },
      logo: {
        src: "./src/assets/nevela-mark.svg",
        replacesTitle: false,
      },
      editLink: {
        baseUrl: `${REPO}/edit/main/apps/docs/`,
      },
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "What is Nevela?", slug: "start/introduction" },
            { label: "Quickstart", slug: "start/quickstart" },
            { label: "Project structure", slug: "start/project-structure" },
          ],
        },
        {
          label: "Core concepts",
          items: [
            { label: "Resources", slug: "concepts/resources" },
            { label: "Field types", slug: "concepts/field-types" },
            { label: "The resource descriptor", slug: "concepts/descriptor" },
            { label: "Regeneration and your code", slug: "concepts/regeneration" },
            { label: "How Nevela is built", slug: "concepts/architecture" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Build a shop", slug: "guides/shop" },
            { label: "Relationships", slug: "guides/relationships" },
            { label: "Files and images", slug: "guides/images" },
            { label: "The web app", slug: "guides/web-app" },
            { label: "Authentication", slug: "guides/authentication" },
            { label: "Roles and policies", slug: "guides/policies" },
            { label: "Seeding data", slug: "guides/seeding" },
            { label: "Updating and upgrading", slug: "guides/updating" },
            { label: "Configuration", slug: "guides/configuration" },
            { label: "Deploying", slug: "guides/deploying" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Commands", slug: "reference/commands" },
            { label: "REST API", slug: "reference/api" },
            { label: "Changelog", slug: "reference/changelog" },
          ],
        },
        {
          label: "Contributing",
          items: [
            { label: "Working on Nevela", slug: "contributing/development" },
            { label: "Releasing", slug: "contributing/releasing" },
          ],
        },
      ],
    }),
  ],
});

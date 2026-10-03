import type { MetadataRoute } from "next";

// Lets the site be installed on a phone or classroom computer; public/sw.js makes it work offline.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hyphen · Mission Moonlight",
    short_name: "Hyphen",
    description: "Plan Moon south-pole landings and play Race the Shadow, on real NASA JPL sky data.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0d11",
    theme_color: "#0a0d11",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

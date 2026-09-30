import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { LangProvider } from "@/lib/i18n";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";
import "./landing.css";
import "./ui.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: "normal", variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], style: "normal", variable: "--font-mono" });
const bengali = Hind_Siliguri({ subsets: ["bengali", "latin"], weight: ["400", "500", "600"], variable: "--font-bn" });

export const metadata: Metadata = {
  title: { default: "South Pole Window Planner", template: "%s · South Pole Window" },
  description:
    "Compare Moon south-pole landing sites and dates: see when a lander has sunlight for power and Earth in view for direct-to-Earth radio, from NASA JPL DE421.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0d11" },
    { media: "(prefers-color-scheme: light)", color: "#f3f2ee" },
  ],
};

// Applies a saved theme before first paint so there is no flash.
const themeScript = `(function(){try{var t=localStorage.getItem("spwp-theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${bengali.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <LangProvider>
          <SiteHeader />
          {children}
        </LangProvider>
      </body>
    </html>
  );
}

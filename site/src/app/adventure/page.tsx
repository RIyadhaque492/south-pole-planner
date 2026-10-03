import type { Metadata } from "next";
import { Adventure } from "@/components/adventure/Adventure";
import "./adventure.css";

export const metadata: Metadata = {
  title: "Moon Mission",
  description: "Pick your astronaut, suit up, launch, fly to the Moon in 3D, land near the south pole and plant your flag.",
};

export default function AdventurePage() {
  return <Adventure />;
}

import type { Metadata } from "next";
import { GeometryGate } from "@/components/GeometryGate";
import { Missions } from "@/components/missions/Missions";

export const metadata: Metadata = {
  title: "Real missions",
  description: "The sky that real CLPS Moon landers saw, replayed from NASA JPL data and compared with what happened.",
};

export default function MissionsPage() {
  return (
    <GeometryGate>
      <Missions />
    </GeometryGate>
  );
}

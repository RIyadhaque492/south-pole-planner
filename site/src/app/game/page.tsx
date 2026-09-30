import type { Metadata } from "next";
import { GeometryGate } from "@/components/GeometryGate";
import { Game } from "@/components/game/Game";

export const metadata: Metadata = {
  title: "Race the Shadow",
  description: "Keep a Moon lander alive through the lunar night and send science home while Earth is up, on real NASA JPL sky data.",
};

export default function GamePage() {
  return (
    <GeometryGate>
      <Game />
    </GeometryGate>
  );
}

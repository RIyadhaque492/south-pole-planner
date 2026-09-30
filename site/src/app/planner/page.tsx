import type { Metadata } from "next";
import { GeometryGate } from "@/components/GeometryGate";
import { Planner } from "@/components/planner/Planner";

export const metadata: Metadata = {
  title: "Planner",
  description: "Compare south-pole landing sites and dates: sunlight for power and Earth in view for radio, hour by hour.",
};

export default function PlannerPage() {
  return (
    <GeometryGate>
      <Planner />
    </GeometryGate>
  );
}

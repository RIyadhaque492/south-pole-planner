import type { Metadata } from "next";
import { Ask } from "@/components/ask/Ask";

export const metadata: Metadata = {
  title: "Ask Luna",
  description: "Ask a friendly robot guide about the Moon's south pole. Her Sun and Earth answers come from the same NASA JPL data as the Planner.",
};

export default function AskPage() {
  return <Ask />;
}

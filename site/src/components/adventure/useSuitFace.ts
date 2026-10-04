"use client";
import { useEffect, useState } from "react";
import { suitFace, suitImg, type Kid, type Suit } from "./data";

/** The suit picture with the child's face in the helmet; the plain suit until that is ready. */
export function useSuitFace(suit: Suit, kid: Kid, pose: "wave" | "salute" = "wave") {
  const [url, setUrl] = useState(() => suitImg(suit, pose));
  useEffect(() => {
    let live = true;
    void suitFace(suit, kid, pose).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [suit, kid, pose]);
  return url;
}

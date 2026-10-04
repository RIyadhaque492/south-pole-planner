"use client";
import { CABIN } from "./data";

const RIVETS = 18;

/** Looking at the galaxy from the ship, over the live 3D sky. "outside": the child in their suit, helmet glass clear,
    behind a round window with the Milky Way reflected in it. "inside": the cabin, its big window open onto the
    galaxy, with the child floating by it. `suited` is the suit picture with the child's face in the helmet. */
export function Porthole({ suited, side }: { suited: string; side: "outside" | "inside" }) {
  if (side === "outside") {
    return (
      <div className="mm-port out" aria-hidden="true">
        <div className="mm-hull" />
        <div className="mm-port-hole">
          <div className="mm-port-glass">
            <div className="mm-port-cabin" />
            <img className="mm-port-kid" src={suited} alt="" />
            <div className="mm-port-reflect" />
          </div>
          <div className="mm-port-ring">
            {Array.from({ length: RIVETS }, (_, i) => <i key={i} style={{ "--a": `${(i / RIVETS) * 360}deg` } as React.CSSProperties} />)}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mm-port in" aria-hidden="true">
      <img className="mm-cabin" src={CABIN} alt="" />
      <img className="mm-cabin-kid" src={suited} alt="" />
    </div>
  );
}

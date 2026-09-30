"use client";
import { useI18n } from "@/lib/i18n";
import { useGeometry } from "@/lib/useGeometry";

/** Renders children only once the ephemeris table is loaded, so they can compute synchronously. */
export function GeometryGate({ children }: { children: React.ReactNode }) {
  const state = useGeometry();
  const { t } = useI18n();
  if (state === "ready") return <>{children}</>;
  return (
    <div className="wrap loading" role="status">
      {state === "loading" && <div className="orb" aria-hidden="true" />}
      <span>{state === "error" ? t("loadFail") : t("loading")}</span>
    </div>
  );
}

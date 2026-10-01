"use client";
import Image from "next/image";
import { useI18n } from "@/lib/i18n";
import { useGeometry } from "@/lib/useGeometry";

/** Renders children only once the ephemeris table is loaded, so they can compute synchronously. */
export function GeometryGate({ children }: { children: React.ReactNode }) {
  const state = useGeometry();
  const { t } = useI18n();
  if (state === "ready") return <>{children}</>;
  return (
    <div className="wrap loading" role="status">
      {state === "loading" && (
        <div className="loader" aria-hidden="true">
          <Image src="/img/loader-lander.webp" alt="" width={160} height={160} loading="eager" unoptimized />
        </div>
      )}
      <span>{state === "error" ? t("loadFail") : t("loading")}</span>
    </div>
  );
}

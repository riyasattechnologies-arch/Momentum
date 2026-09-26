"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

export default function AppIndex() {
  const router = useRouter();
  const stage = useStore((s) => s.stage);
  useEffect(() => {
    router.replace(stage === "active" ? "/app/today" : stage === "proposal" ? "/app/plan" : "/app/onboarding");
  }, [stage, router]);
  return null;
}

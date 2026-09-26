"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { loadDemo } from "@/lib/seed";

export default function DemoPage() {
  const router = useRouter();
  useEffect(() => {
    loadDemo();
    router.replace("/app/today");
  }, [router]);
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="num text-xs text-dim"><span className="pulse-dot">●</span> loading Aisha's semester</div>
    </div>
  );
}

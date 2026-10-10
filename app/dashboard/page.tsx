import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard | TraceWatch",
  description: "Live breach intelligence, source health and your session's scan activity. No login required.",
};

export default function DashboardPage() {
  return <Dashboard />;
}

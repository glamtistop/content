import { StatusPage } from "@/components/StatusPage";
export default function Calendar() {
  return <StatusPage title="Content calendar" status="Planned / Not Implemented"
    intro="Day, week and month views with drafts, scheduled and published posts arrive in Phase 3. Nothing is scheduled or published by ContentPilot today."
    needs={["Phase 3 build: calendar views, drag-and-drop, timezone-aware reminders.", "Direct scheduling also needs TikTok's Content Posting API audit and Meta app review."]}
    now={<p>Use the posting windows on each package and the Best time to post screen, then set a phone reminder.</p>} />;
}

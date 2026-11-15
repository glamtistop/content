import { StatusPage } from "@/components/StatusPage";
export default function Analytics() {
  return <StatusPage title="Analytics" status="Requires Platform Approval"
    intro="No metrics are shown because no real data is connected. ContentPilot never fills this screen with sample numbers."
    needs={["TikTok and Meta app review for insights permissions (Phase 2).", "Analytics-file uploads and manual entry (Phase 2) — for when integrations aren't available."]}
    now={<p>Note which posts bring messages or orders. That's the data that will matter most once tracking is on.</p>} />;
}

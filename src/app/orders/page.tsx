import { StatusPage } from "@/components/StatusPage";
export default function Orders() {
  return <StatusPage title="Orders & leads" status="Planned / Not Implemented"
    intro="Linking posts to inquiries, quotes, orders and revenue — with attributed, estimated and manually-linked results kept separate — arrives in Phase 3."
    needs={["Phase 3 build: manual entry first, then optional website, ecommerce and UTM tracking."]}
    now={<p>Add a UTM tag to links you share, e.g. <code className="text-teal">yoursite.com/?utm_source=tiktok&utm_campaign=keychains</code>, so orders can be traced back later.</p>} />;
}

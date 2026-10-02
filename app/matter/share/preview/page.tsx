import { redirect } from "next/navigation";
import { isConnected, loadDigest } from "@/lib/data";
import { buildProviderView, loadShareState } from "@/lib/share";
import { ProviderView } from "@/components/ProviderView";
import { TopBar } from "@/components/TopBar";
import { EyeIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Attorney-side preview: same projection the provider gets, without logging an open. */
export default async function PreviewPage() {
  const digest = await loadDigest();
  if (!digest) {
    if (!(await isConnected())) redirect("/");
    redirect("/matter");
  }
  const share = await loadShareState(digest);
  const view = buildProviderView(digest, share);

  return (
    <>
      <TopBar active="provider" right={<span>{view.providerName ? `Viewing as ${view.providerName}` : "No provider selected"}</span>} />
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 32px 0" }} className="preview-wrap">
        <div className="banner banner-accent" role="note">
          <EyeIcon />
          <span>
            Preview: this is exactly what {view.providerName || "the provider"} sees.
          </span>
        </div>
      </div>
      <ProviderView view={view} />
    </>
  );
}

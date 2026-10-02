import { redirect } from "next/navigation";
import { isConnected } from "@/lib/data";
import { Logo, LockIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await isConnected()) redirect("/matter");

  return (
    <main className="connect">
      <div className="card card-lg" style={{ gap: 18 }}>
        <div className="brand" style={{ fontSize: 22 }}>
          <Logo size={30} />
          <span>CaseBrief</span>
        </div>
        <h1 className="h1" style={{ fontSize: 26 }}>
          Get up to speed on a case in 60 seconds.
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          CaseBrief reads one matter from Clio Manage and turns the whole file into a brief for the attorney and a safe
          status page for the treating provider.
        </p>
        <div>
          <a className="btn btn-primary" href="/api/clio/login">
            Connect Clio (read-only)
          </a>
        </div>
        <div className="banner" style={{ fontSize: 13 }}>
          <LockIcon />
          <span>CaseBrief only reads from Clio. It never creates, edits or deletes anything in your account.</span>
        </div>
      </div>
    </main>
  );
}

import { useParams } from "react-router-dom";
import { EntityContextContent } from "./EntityContextPanel";

export default function EntityWorkspace() {
  const { entityId } = useParams();

  return (
    <div style={{ padding: "24px", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--t1)", letterSpacing: "-0.4px", marginBottom: 24 }}>
        Entity Workspace
      </h1>
      <EntityContextContent entityId={entityId} />
    </div>
  );
}

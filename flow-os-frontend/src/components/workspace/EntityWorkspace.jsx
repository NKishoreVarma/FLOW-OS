import { useParams } from "react-router-dom";
import { EntityContextContent } from "./EntityContextPanel";

export default function EntityWorkspace() {
  const { entityId } = useParams();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-ui-xl font-bold text-text-primary tracking-tight mb-6">
        Entity Workspace
      </h1>
      <EntityContextContent entityId={entityId} />
    </div>
  );
}

import Skeleton from "./Skeleton";

export function PageSkeleton() {
  return (
    <div className="flex-1 overflow-hidden">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton.Card />
          <Skeleton.Card />
          <Skeleton.Card />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Skeleton.Card />
            <Skeleton.Card />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <Skeleton.Card />
            <Skeleton.Card />
          </div>
        </div>
      </div>
    </div>
  );
}

export default PageSkeleton;

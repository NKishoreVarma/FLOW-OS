import { AlertCircle, RefreshCw } from "lucide-react";

export function ErrorState({ message = "Something went wrong", onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center px-4">
      <div className="w-10 h-10 rounded-xl bg-critical/10 border border-critical/20 flex items-center justify-center mb-3">
        <AlertCircle className="w-5 h-5 text-critical" />
      </div>
      <p className="text-ui-sm font-semibold text-text-secondary">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 flex items-center space-x-1.5 text-ui-xs text-flow-purple hover:text-flow-purple/80 font-medium cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Try again</span>
        </button>
      )}
    </div>
  );
}

export default ErrorState;

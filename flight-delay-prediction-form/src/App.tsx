import { FlightDelayPredictor } from './components/FlightDelayPredictor';
import { getRuntimeConfig } from './lib/runtime';

export default function App() {
  const runtimeConfig = getRuntimeConfig();
  const startupIssue = runtimeConfig.backendStartup;

  if (runtimeConfig.runtimeTarget === 'desktop' && (runtimeConfig.backendStartupError || !runtimeConfig.apiBaseUrl)) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-700">Desktop Startup Issue</p>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">
            {startupIssue?.title ?? 'The local prediction service did not start.'}
          </h1>
          <p className="mt-4 text-base leading-7 text-gray-700">
            {runtimeConfig.backendStartupError ?? 'The packaged app could not determine its local backend URL.'}
          </p>
          {startupIssue?.technicalSummary ? (
            <p className="mt-4 rounded-lg bg-gray-100 px-4 py-3 text-sm leading-6 text-gray-700">
              <span className="font-semibold text-gray-900">Technical summary:</span> {startupIssue.technicalSummary}
            </p>
          ) : null}
          {startupIssue?.logPath ? (
            <p className="mt-4 text-sm text-gray-600">
              Log file: <span className="font-mono text-xs text-gray-800">{startupIssue.logPath}</span>
            </p>
          ) : null}
          <p className="mt-4 text-sm text-gray-500">
            Rebuild the desktop package after validating the bundled backend executable, code signing, and trained model artifact.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <FlightDelayPredictor />
    </div>
  );
}

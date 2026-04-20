import { FlightDelayPredictor } from './components/FlightDelayPredictor';
import { getRuntimeConfig } from './lib/runtime';

export default function App() {
  const runtimeConfig = getRuntimeConfig();

  if (runtimeConfig.runtimeTarget === 'desktop' && (runtimeConfig.backendStartupError || !runtimeConfig.apiBaseUrl)) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-700">Desktop Startup Issue</p>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">The local prediction service did not start.</h1>
          <p className="mt-4 text-base leading-7 text-gray-700">
            {runtimeConfig.backendStartupError ?? 'The packaged app could not determine its local backend URL.'}
          </p>
          <p className="mt-4 text-sm text-gray-500">
            Rebuild the desktop package after validating the bundled backend executable and trained model artifact.
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

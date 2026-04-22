import { DesktopRuntimeNotice } from './components/DesktopRuntimeNotice';
import { FlightDelayPredictor } from './components/FlightDelayPredictor';
import {
  describeDesktopRuntimeMessage,
  shouldShowDesktopStartupIssue,
  useRuntimeConfig,
} from './lib/runtime';

export default function App() {
  const runtimeConfig = useRuntimeConfig();

  if (shouldShowDesktopStartupIssue(runtimeConfig)) {
    const message = describeDesktopRuntimeMessage(runtimeConfig);

    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-700">Desktop Startup Issue</p>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">The local prediction service did not start.</h1>
          <div className="mt-4">
            <DesktopRuntimeNotice
              title="Bundled Backend"
              message={message}
            />
          </div>
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

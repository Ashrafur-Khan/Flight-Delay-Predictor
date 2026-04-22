import type { DesktopRuntimeMessage } from '@/lib/runtime';

interface DesktopRuntimeNoticeProps {
  title: string;
  message: DesktopRuntimeMessage;
  compact?: boolean;
}

const toneClasses: Record<DesktopRuntimeMessage['tone'], string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  error: 'border-red-200 bg-red-50 text-red-950',
};

const summaryTextClasses: Record<DesktopRuntimeMessage['tone'], string> = {
  info: 'text-blue-900',
  warning: 'text-amber-900',
  error: 'text-red-900',
};

const detailTextClasses: Record<DesktopRuntimeMessage['tone'], string> = {
  info: 'text-blue-800',
  warning: 'text-amber-800',
  error: 'text-red-800',
};

export function DesktopRuntimeNotice({ title, message, compact = false }: DesktopRuntimeNoticeProps) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClasses[message.tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className={`mt-1 ${compact ? 'text-sm' : 'text-base'} ${summaryTextClasses[message.tone]}`}>
        {message.summary}
      </p>

      {message.details && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">Technical details</summary>
          <p className={`mt-2 break-words rounded-lg bg-white/70 px-3 py-2 text-sm ${detailTextClasses[message.tone]}`}>
            {message.details}
          </p>
        </details>
      )}
    </div>
  );
}

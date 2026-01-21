'use client';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>&copy; {currentYear} MeetingAI</span>
            <span className="hidden sm:inline">|</span>
            <span className="hidden sm:inline">AI-Powered Meeting Intelligence</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-400 dark:text-gray-500">
              Powered by AWS Transcribe & Claude AI
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

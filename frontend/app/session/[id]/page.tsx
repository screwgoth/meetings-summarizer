'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { sessionsAPI, MeetingSession } from '@/lib/api';
import { format } from 'date-fns';
import Layout from '@/components/Layout';

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [session, setSession] = useState<MeetingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSpeakerMapping, setShowSpeakerMapping] = useState(false);
  const [speakerLabels, setSpeakerLabels] = useState<string[]>([]);
  const [speakerMappings, setSpeakerMappings] = useState<Record<string, string>>({});
  const [savingMappings, setSavingMappings] = useState(false);
  const [stoppingStage, setStoppingStage] = useState<string | null>(null);
  const [restartingStage, setRestartingStage] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  useEffect(() => {
    let pollingInterval: ReturnType<typeof setInterval> | null = null;

    const init = async () => {
      await loadSession();

      const terminalStatuses = ['completed', 'error', 'stopped_transcription', 'stopped_analysis'];

      pollingInterval = setInterval(async () => {
        try {
          const data = await sessionsAPI.getOne(params.id as string);

          if (!terminalStatuses.includes(data.status)) {
            const updatedData = await sessionsAPI.process(params.id as string);
            setSession(updatedData);

            if (updatedData.status === 'completed' && updatedData.transcription) {
              try {
                const speakerData = await sessionsAPI.getSpeakerLabels(params.id as string);
                setSpeakerLabels(speakerData.labels);
                setSpeakerMappings(speakerData.current_mappings);
              } catch (err) {
                console.error('Failed to load speaker labels', err);
              }
            }
          } else {
            setSession(data);
          }
        } catch (err: any) {
          console.error('Polling error:', err);
          if (err.response?.status === 401) {
            if (pollingInterval) clearInterval(pollingInterval);
            localStorage.removeItem('token');
            router.push('/login');
          }
        }
      }, 5000);
    };

    init();

    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [params.id, router]);

  const loadSession = async () => {
    try {
      const data = await sessionsAPI.getOne(params.id as string);
      setSession(data);

      if (data.transcription && data.status === 'completed') {
        try {
          const speakerData = await sessionsAPI.getSpeakerLabels(params.id as string);
          setSpeakerLabels(speakerData.labels);
          setSpeakerMappings(speakerData.current_mappings);
        } catch (err) {
          console.error('Failed to load speaker labels', err);
        }
      }
    } catch (err: any) {
      console.error('Failed to load session:', err);
      if (err.response?.status === 401) {
        localStorage.removeItem('token');
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSpeakerMappings = async () => {
    if (!session) return;

    setSavingMappings(true);
    try {
      const updated = await sessionsAPI.renameSpeakers(session.id, speakerMappings);
      setSession(updated);

      try {
        const speakerData = await sessionsAPI.getSpeakerLabels(session.id);
        setSpeakerMappings(speakerData.current_mappings);
      } catch (err) {
        console.error('Failed to reload speaker labels', err);
      }

      setShowSpeakerMapping(false);
    } catch (err: any) {
      console.error('Failed to save speaker mappings', err);
      alert('Failed to save speaker mappings. Please try again.');
    } finally {
      setSavingMappings(false);
    }
  };

  const downloadText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToWord = async () => {
    if (!session) return;
    setExportingFormat('word');

    try {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${session.title}</title>
<style>
  body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
  h1 { color: #4F46E5; border-bottom: 2px solid #4F46E5; padding-bottom: 10px; }
  h2 { color: #6366F1; margin-top: 30px; }
  .meta { color: #6B7280; font-size: 14px; margin-bottom: 20px; }
  .section { margin-bottom: 30px; }
</style>
</head>
<body>
<h1>${session.title}</h1>
<p class="meta">Generated on ${format(new Date(), 'PPpp')}</p>

${session.summary ? `
<div class="section">
<h2>Summary</h2>
<p>${session.summary.replace(/\n/g, '<br>')}</p>
</div>
` : ''}

${session.action_items ? `
<div class="section">
<h2>Action Items</h2>
<p>${session.action_items.replace(/\n/g, '<br>')}</p>
</div>
` : ''}

</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meeting-report-${session.id}.doc`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export to Word', err);
      alert('Failed to export document');
    } finally {
      setExportingFormat(null);
    }
  };

  const exportToPDF = async () => {
    if (!session) return;
    setExportingFormat('pdf');

    try {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${session.title}</title>
<style>
  @page { margin: 1in; }
  body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 100%; padding: 0; color: #1F2937; }
  h1 { color: #4F46E5; border-bottom: 2px solid #4F46E5; padding-bottom: 10px; font-size: 24px; }
  h2 { color: #6366F1; margin-top: 30px; font-size: 18px; }
  .meta { color: #6B7280; font-size: 12px; margin-bottom: 20px; }
  .section { margin-bottom: 30px; page-break-inside: avoid; }
  p { margin: 0 0 10px 0; }
</style>
</head>
<body>
<h1>${session.title}</h1>
<p class="meta">Generated on ${format(new Date(), 'PPpp')}</p>

${session.summary ? `
<div class="section">
<h2>Summary</h2>
<p>${session.summary.replace(/\n/g, '<br>')}</p>
</div>
` : ''}

${session.action_items ? `
<div class="section">
<h2>Action Items</h2>
<p>${session.action_items.replace(/\n/g, '<br>')}</p>
</div>
` : ''}

</body>
</html>`;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (err) {
      console.error('Failed to export to PDF', err);
      alert('Failed to export document');
    } finally {
      setExportingFormat(null);
    }
  };

  const handleStopStage = async (stage: 'transcription' | 'analysis') => {
    if (!session) return;

    setStoppingStage(stage);
    try {
      const updated = await sessionsAPI.stop(session.id, stage);
      setSession(updated);
    } catch (err: any) {
      console.error(`Failed to stop ${stage}:`, err);
      alert(`Failed to stop ${stage}. ${err.response?.data?.detail || 'Please try again.'}`);
    } finally {
      setStoppingStage(null);
    }
  };

  const handleRestartStage = async (stage: 'transcription' | 'analysis') => {
    if (!session) return;

    setRestartingStage(stage);
    try {
      const updated = await sessionsAPI.restart(session.id, stage);
      setSession(updated);
    } catch (err: any) {
      console.error(`Failed to restart ${stage}:`, err);
      alert(`Failed to restart ${stage}. ${err.response?.data?.detail || 'Please try again.'}`);
    } finally {
      setRestartingStage(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 spinner mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">Session not found</p>
          <button onClick={() => router.push('/dashboard')} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const getPhaseStatus = (phase: 'upload' | 'transcribe' | 'analyze') => {
    const status = session.status;

    if (phase === 'upload') {
      return status === 'uploading' ? 'active' : 'complete';
    }
    if (phase === 'transcribe') {
      if (status === 'uploading') return 'pending';
      if (status === 'transcribing') return 'active';
      if (['analyzing', 'completed', 'stopped_analysis'].includes(status)) return 'complete';
      return 'pending';
    }
    if (phase === 'analyze') {
      if (['uploading', 'transcribing', 'stopped_transcription'].includes(status)) return 'pending';
      if (status === 'analyzing') return 'active';
      if (status === 'completed') return 'complete';
      return 'pending';
    }
    return 'pending';
  };

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        {/* Back Button and Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-4"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {session.title}
              </h1>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                {format(new Date(session.upload_date), 'EEEE, MMMM d, yyyy • h:mm a')}
              </p>
            </div>
            {session.status === 'completed' && (session.summary || session.action_items) && (
              <div className="flex gap-2">
                <button
                  onClick={exportToWord}
                  disabled={exportingFormat !== null}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  {exportingFormat === 'word' ? (
                    <div className="w-4 h-4 spinner border-2"></div>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  Word
                </button>
                <button
                  onClick={exportToPDF}
                  disabled={exportingFormat !== null}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  {exportingFormat === 'pdf' ? (
                    <div className="w-4 h-4 spinner border-2"></div>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  )}
                  PDF
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Processing Status */}
        {!['completed', 'error', 'stopped_transcription', 'stopped_analysis'].includes(session.status) && (
          <div className="card p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Processing Status</h3>

            <div className="flex items-center justify-between">
              {/* Phase 1: Upload */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  getPhaseStatus('upload') === 'complete'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : getPhaseStatus('upload') === 'active'
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                }`}>
                  {getPhaseStatus('upload') === 'complete' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : getPhaseStatus('upload') === 'active' ? (
                    <div className="w-5 h-5 spinner border-2"></div>
                  ) : (
                    <span className="text-sm font-medium">1</span>
                  )}
                </div>
                <span className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">Upload</span>
              </div>

              {/* Connector */}
              <div className={`flex-1 h-1 mx-4 rounded ${
                getPhaseStatus('transcribe') !== 'pending' ? 'bg-indigo-200 dark:bg-indigo-800' : 'bg-gray-200 dark:bg-gray-700'
              }`} />

              {/* Phase 2: Transcribe */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  getPhaseStatus('transcribe') === 'complete'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : getPhaseStatus('transcribe') === 'active'
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                }`}>
                  {getPhaseStatus('transcribe') === 'complete' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : getPhaseStatus('transcribe') === 'active' ? (
                    <div className="w-5 h-5 spinner border-2"></div>
                  ) : (
                    <span className="text-sm font-medium">2</span>
                  )}
                </div>
                <span className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">Transcribe</span>
                {session.status === 'transcribing' && (
                  <button
                    onClick={() => handleStopStage('transcription')}
                    disabled={stoppingStage === 'transcription'}
                    className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    {stoppingStage === 'transcription' ? 'Stopping...' : 'Stop'}
                  </button>
                )}
              </div>

              {/* Connector */}
              <div className={`flex-1 h-1 mx-4 rounded ${
                getPhaseStatus('analyze') !== 'pending' ? 'bg-indigo-200 dark:bg-indigo-800' : 'bg-gray-200 dark:bg-gray-700'
              }`} />

              {/* Phase 3: Analyze */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  getPhaseStatus('analyze') === 'complete'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : getPhaseStatus('analyze') === 'active'
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                }`}>
                  {getPhaseStatus('analyze') === 'complete' ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : getPhaseStatus('analyze') === 'active' ? (
                    <div className="w-5 h-5 spinner border-2"></div>
                  ) : (
                    <span className="text-sm font-medium">3</span>
                  )}
                </div>
                <span className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">Analyze</span>
                {session.status === 'analyzing' && (
                  <button
                    onClick={() => handleStopStage('analysis')}
                    disabled={stoppingStage === 'analysis'}
                    className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    {stoppingStage === 'analysis' ? 'Stopping...' : 'Stop'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Status Banners */}
        {session.status === 'stopped_transcription' && (
          <div className="alert alert-warning mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium">Transcription Paused</p>
                <p className="text-sm opacity-80">You can restart the transcription when ready.</p>
              </div>
            </div>
            <button
              onClick={() => handleRestartStage('transcription')}
              disabled={restartingStage === 'transcription'}
              className="btn-primary text-sm"
            >
              {restartingStage === 'transcription' ? 'Restarting...' : 'Restart'}
            </button>
          </div>
        )}

        {session.status === 'stopped_analysis' && (
          <div className="alert alert-warning mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium">Analysis Paused</p>
                <p className="text-sm opacity-80">You can restart the analysis or re-transcribe.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleRestartStage('transcription')}
                disabled={restartingStage !== null}
                className="btn-secondary text-sm"
              >
                Re-transcribe
              </button>
              <button
                onClick={() => handleRestartStage('analysis')}
                disabled={restartingStage !== null}
                className="btn-primary text-sm"
              >
                {restartingStage === 'analysis' ? 'Restarting...' : 'Restart Analysis'}
              </button>
            </div>
          </div>
        )}

        {session.status === 'error' && (
          <div className="alert alert-error mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium">Processing Error</p>
                <p className="text-sm opacity-80">{session.error || 'An error occurred during processing.'}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleRestartStage('transcription')}
                disabled={restartingStage !== null}
                className="btn-secondary text-sm"
              >
                Retry Transcription
              </button>
              {session.transcription && (
                <button
                  onClick={() => handleRestartStage('analysis')}
                  disabled={restartingStage !== null}
                  className="btn-primary text-sm"
                >
                  Retry Analysis
                </button>
              )}
            </div>
          </div>
        )}

        {session.status === 'completed' && (
          <div className="alert alert-success mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium">Processing Complete</p>
                <p className="text-sm opacity-80">Your meeting has been transcribed and analyzed.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleRestartStage('transcription')}
                disabled={restartingStage !== null}
                className="btn-secondary text-sm"
              >
                Re-transcribe
              </button>
              <button
                onClick={() => handleRestartStage('analysis')}
                disabled={restartingStage !== null}
                className="btn-secondary text-sm"
              >
                Re-analyze
              </button>
              {speakerLabels.length > 0 && (
                <button
                  onClick={() => setShowSpeakerMapping(!showSpeakerMapping)}
                  className="btn-primary text-sm"
                >
                  {showSpeakerMapping ? 'Hide' : 'Edit'} Speakers
                </button>
              )}
            </div>
          </div>
        )}

        {/* Speaker Mapping */}
        {showSpeakerMapping && speakerLabels.length > 0 && (
          <div className="card p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Speaker Names</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Replace speaker labels with actual names</p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              {speakerLabels.map((label) => (
                <div key={label} className="flex items-center gap-4">
                  <span className="w-20 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-lg">
                    {label}
                  </span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  <input
                    type="text"
                    value={speakerMappings[label] || ''}
                    onChange={(e) => setSpeakerMappings({ ...speakerMappings, [label]: e.target.value })}
                    placeholder="Enter name"
                    className="input flex-1"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSaveSpeakerMappings}
                disabled={savingMappings}
                className="btn-primary"
              >
                {savingMappings ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setShowSpeakerMapping(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Content Cards */}
        <div className="space-y-6">
          {/* Summary */}
          {session.summary && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Summary</h2>
                </div>
                <button
                  onClick={() => downloadText(session.summary!, `summary-${session.id}.txt`)}
                  className="btn-secondary text-sm"
                >
                  Download
                </button>
              </div>
              <div className="prose dark:prose-invert max-w-none">
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{session.summary}</p>
              </div>
            </div>
          )}

          {/* Action Items */}
          {session.action_items && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Action Items</h2>
                </div>
                <button
                  onClick={() => downloadText(session.action_items!, `action-items-${session.id}.txt`)}
                  className="btn-secondary text-sm"
                >
                  Download
                </button>
              </div>
              <div className="prose dark:prose-invert max-w-none">
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{session.action_items}</p>
              </div>
            </div>
          )}

          {/* Transcription */}
          {session.transcription && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Transcription</h2>
                </div>
                <button
                  onClick={() => downloadText(session.transcription!, `transcript-${session.id}.txt`)}
                  className="btn-secondary text-sm"
                >
                  Download
                </button>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono">
                  {session.transcription}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

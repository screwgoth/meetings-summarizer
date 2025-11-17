'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { sessionsAPI, MeetingSession, usersAPI } from '@/lib/api';
import { format } from 'date-fns';

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [session, setSession] = useState<MeetingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showSpeakerMapping, setShowSpeakerMapping] = useState(false);
  const [speakerLabels, setSpeakerLabels] = useState<string[]>([]);
  const [speakerMappings, setSpeakerMappings] = useState<Record<string, string>>({});
  const [savingMappings, setSavingMappings] = useState(false);

  useEffect(() => {
    let pollingInterval: ReturnType<typeof setInterval> | null = null;

    const init = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const profile = await usersAPI.getProfile();
        if (profile.must_change_password) {
          router.push('/profile?firstLogin=1');
          return;
        }
      } catch (err: any) {
        console.error('Failed to verify user profile', err);
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
        }
        return;
      }

      await loadSession();

      pollingInterval = setInterval(async () => {
        try {
          const data = await sessionsAPI.getOne(params.id as string);
          console.log('🔄 Polling - Current session:', data);

          if (data.status !== 'completed' && data.status !== 'error') {
            console.log('📞 Calling process endpoint for status:', data.status);
            const updatedData = await sessionsAPI.process(params.id as string);
            console.log('✅ Process response:', updatedData);
            setSession(updatedData);
            
            // Load speaker labels when transcription is complete
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
            console.log('⏹️ Session finished with status:', data.status);
            setSession(data);
          }
        } catch (err: any) {
          console.error('❌ Polling error:', err);
          if (err.response?.status === 401) {
            if (pollingInterval) {
              clearInterval(pollingInterval);
            }
            localStorage.removeItem('token');
            router.push('/login');
          }
        }
      }, 5000);
    };

    init();

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [params.id, router]);

  const loadSession = async () => {
    try {
      const data = await sessionsAPI.getOne(params.id as string);
      console.log('📥 Initial load - Session:', data);
      setSession(data);
      
      // Load speaker labels if transcription exists
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
      console.error('❌ Failed to load session:', err);
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
      
      // Reload speaker labels to get updated mappings
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-600">Session not found</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-blue-600 hover:text-blue-800 font-semibold mb-2"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{session.title}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {format(new Date(session.upload_date), 'PPpp')}
          </p>
        </div>
      </header>

      {/* Status Banner with Phases */}
      {session.status !== 'completed' && session.status !== 'error' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Processing Status</h3>
            
            {/* Phase Progress */}
            <div className="space-y-4">
              {/* Phase 1: Uploading */}
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  {session.status === 'uploading' ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  ) : (
                    <div className="rounded-full h-6 w-6 bg-green-500 flex items-center justify-center">
                      <span className="text-white text-sm">✓</span>
                    </div>
                  )}
                </div>
                <div className="ml-3">
                  <p className={`font-medium ${session.status === 'uploading' ? 'text-blue-600' : 'text-green-600'}`}>
                    Uploading to S3
                  </p>
                  <p className="text-sm text-gray-500">
                    {session.status === 'uploading' ? 'Uploading your audio file...' : 'File uploaded successfully'}
                  </p>
                </div>
              </div>

              {/* Phase 2: Transcribing */}
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  {session.status === 'transcribing' ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  ) : session.status === 'uploading' ? (
                    <div className="rounded-full h-6 w-6 bg-gray-300"></div>
                  ) : (
                    <div className="rounded-full h-6 w-6 bg-green-500 flex items-center justify-center">
                      <span className="text-white text-sm">✓</span>
                    </div>
                  )}
                </div>
                <div className="ml-3">
                  <p className={`font-medium ${session.status === 'transcribing' ? 'text-blue-600' : session.status === 'uploading' ? 'text-gray-400' : 'text-green-600'}`}>
                    Transcribing Audio
                  </p>
                  <p className="text-sm text-gray-500">
                    {session.status === 'transcribing' ? 'Converting speech to text with speaker labels...' : 
                     session.status === 'uploading' ? 'Waiting...' : 'Transcription completed'}
                  </p>
                </div>
              </div>

              {/* Phase 3: Analyzing */}
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  {session.status === 'analyzing' ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  ) : session.status === 'uploading' || session.status === 'transcribing' ? (
                    <div className="rounded-full h-6 w-6 bg-gray-300"></div>
                  ) : (
                    <div className="rounded-full h-6 w-6 bg-green-500 flex items-center justify-center">
                      <span className="text-white text-sm">✓</span>
                    </div>
                  )}
                </div>
                <div className="ml-3">
                  <p className={`font-medium ${session.status === 'analyzing' ? 'text-blue-600' : (session.status === 'uploading' || session.status === 'transcribing') ? 'text-gray-400' : 'text-green-600'}`}>
                    AI Analysis
                  </p>
                  <p className="text-sm text-gray-500">
                    {session.status === 'analyzing' ? 'Generating summary and extracting action items...' : 
                     (session.status === 'uploading' || session.status === 'transcribing') ? 'Waiting...' : 'Analysis completed'}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                This process may take a few minutes depending on the length of your recording.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {session.status === 'error' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-red-600 text-xl">⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Processing Error</h3>
                <p className="mt-2 text-sm text-red-700">
                  {(session as any).error || 'An error occurred while processing your meeting.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completion Banner */}
      {session.status === 'completed' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-green-600 text-xl">✓</span>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">Processing Complete</h3>
                  <p className="mt-1 text-sm text-green-700">
                    Your meeting has been transcribed and analyzed successfully.
                  </p>
                </div>
              </div>
              {speakerLabels.length > 0 && (
                <button
                  onClick={() => setShowSpeakerMapping(!showSpeakerMapping)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
                >
                  {showSpeakerMapping ? 'Hide' : 'Edit'} Speaker Names
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Speaker Mapping UI */}
      {session.status === 'completed' && showSpeakerMapping && speakerLabels.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">👥 Assign Speaker Names</h2>
            <p className="text-sm text-gray-600 mb-4">
              Replace speaker labels (spk_0, spk_1, etc.) with actual participant names. 
              Changes will be applied to the transcription, summary, and action items.
            </p>
            <div className="space-y-3">
              {speakerLabels.map((label) => (
                <div key={label} className="flex items-center gap-4">
                  <label className="w-24 text-sm font-medium text-gray-700">
                    {label}:
                  </label>
                  <input
                    type="text"
                    value={speakerMappings[label] || ''}
                    onChange={(e) =>
                      setSpeakerMappings({
                        ...speakerMappings,
                        [label]: e.target.value,
                      })
                    }
                    placeholder="Enter participant name"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveSpeakerMappings}
                disabled={savingMappings}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition disabled:bg-gray-400"
              >
                {savingMappings ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setShowSpeakerMapping(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg font-semibold transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Transcription */}
        {session.transcription && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">📝 Transcription</h2>
              <button
                onClick={() => downloadText(session.transcription!, `transcript-${session.id}.txt`)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                Download
              </button>
            </div>
            <div className="bg-gray-50 rounded p-4 max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                {session.transcription}
              </pre>
            </div>
          </div>
        )}

        {/* Summary */}
        {session.summary && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">📊 Summary</h2>
              <button
                onClick={() => downloadText(session.summary!, `summary-${session.id}.txt`)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                Download
              </button>
            </div>
            <div className="prose max-w-none">
              <p className="text-gray-700 whitespace-pre-wrap">{session.summary}</p>
            </div>
          </div>
        )}

        {/* Action Items */}
        {session.action_items && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">✅ Action Items</h2>
              <button
                onClick={() => downloadText(session.action_items!, `action-items-${session.id}.txt`)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                Download
              </button>
            </div>
            <div className="prose max-w-none">
              <p className="text-gray-700 whitespace-pre-wrap">{session.action_items}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
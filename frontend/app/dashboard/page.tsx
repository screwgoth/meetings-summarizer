'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { sessionsAPI, MeetingSession, usersAPI } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

export default function DashboardPage() {
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }
      setLoading(true);
      try {
        const profile = await usersAPI.getProfile();
        setIsAdmin(profile.is_admin);
        if (profile.must_change_password) {
          router.push('/profile?firstLogin=1');
          return;
        }
        await loadSessions();
      } catch (err: any) {
        console.error('Failed to initialize dashboard', err);
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await sessionsAPI.getAll();
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;
    
    try {
      await sessionsAPI.delete(id);
      setSessions(sessions.filter(s => s.id !== id));
    } catch (err) {
      alert('Failed to delete session');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'transcribing': return 'bg-blue-100 text-blue-800';
      case 'analyzing': return 'bg-purple-100 text-purple-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">🎙️ My Meetings</h1>
          <div className="flex gap-3">
            {isAdmin && (
              <button
                onClick={() => router.push('/settings')}
                className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-6 py-2 rounded-lg font-semibold transition"
              >
                Settings
              </button>
            )}
            <button
              onClick={() => setShowUploadModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition"
            >
              + New Meeting
            </button>
            <button
              onClick={handleLogout}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg font-semibold transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📁</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No meetings yet</h3>
            <p className="text-gray-500 mb-6">Upload your first meeting recording to get started</p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition"
            >
              Upload Meeting
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onView={() => router.push(`/session/${session.id}`)}
                onDelete={() => handleDeleteSession(session.id)}
                getStatusColor={getStatusColor}
              />
            ))}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            loadSessions();
          }}
        />
      )}
    </div>
  );
}

// Session Card Component
function SessionCard({ session, onView, onDelete, getStatusColor }: any) {
  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-gray-800 line-clamp-2">{session.title}</h3>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(session.status)}`}>
          {session.status}
        </span>
      </div>
      
      <div className="space-y-2 mb-4 text-sm text-gray-600">
        <p>📄 {session.filename}</p>
        <p>📅 {formatDistanceToNow(new Date(session.upload_date), { addSuffix: true })}</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onView}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-semibold transition"
        >
          View Details
        </button>
        <button
          onClick={onDelete}
          className="px-4 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg font-semibold transition"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

// Upload Modal Component
function UploadModal({ onClose, onSuccess }: any) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) return;

    setUploading(true);
    try {
      await sessionsAPI.create(title, file);
      onSuccess();
    } catch (err) {
      alert('Failed to upload meeting');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-6">Upload New Meeting</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meeting Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Weekly Team Standup"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Audio File
            </label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              accept=".mp3,.wav,.mp4,.m4a,.flac,.ogg"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Supported: MP3, WAV, MP4, M4A, FLAC, OGG
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-lg font-semibold transition"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-semibold transition disabled:bg-gray-400"
              disabled={uploading || !file || !title}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
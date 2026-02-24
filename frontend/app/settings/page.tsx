'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminAPI, usersAPI } from '@/lib/api';

interface ManagedUser {
  username: string;
  email?: string | null;
  full_name?: string | null;
  is_admin: boolean;
  must_change_password: boolean;
}

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // AWS Credentials state
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');
  const [s3Bucket, setS3Bucket] = useState('');
  const [bedrockToken, setBedrockToken] = useState('');
  const [awsConfigured, setAwsConfigured] = useState(false);
  const [awsError, setAwsError] = useState('');
  const [awsSuccess, setAwsSuccess] = useState('');
  const [awsSubmitting, setAwsSubmitting] = useState(false);
  const [awsTesting, setAwsTesting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const profile = await usersAPI.getProfile();
        if (!profile.is_admin) {
          router.push('/dashboard');
          return;
        }
        await Promise.all([loadUsers(), loadAWSCredentials()]);
      } catch (err: any) {
        console.error('Failed to load settings', err);
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
        } else {
          setError('Unable to load user management data.');
        }
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router]);

  const loadUsers = async () => {
    try {
      const data = await adminAPI.listUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users', err);
      setError('Unable to load user list.');
    }
  };

  const loadAWSCredentials = async () => {
    try {
      const data = await adminAPI.getAWSCredentials();
      setAwsAccessKey(data.aws_access_key_id || '');
      setAwsRegion(data.aws_region || 'us-east-1');
      setS3Bucket(data.s3_bucket_name || '');
      setBedrockToken(data.bedrock_bearer_token || '');
      setAwsConfigured(data.is_configured);
      // Don't set secret key - it's masked for security
    } catch (err) {
      console.error('Failed to load AWS credentials', err);
    }
  };

  const handleUpdateAWSCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setAwsError('');
    setAwsSuccess('');
    setAwsSubmitting(true);

    try {
      await adminAPI.updateAWSCredentials({
        aws_access_key_id: awsAccessKey || null,
        aws_secret_access_key: awsSecretKey || null,
        aws_region: awsRegion || null,
        s3_bucket_name: s3Bucket || null,
        bedrock_bearer_token: bedrockToken || null,
      });
      setAwsSuccess('AWS credentials updated successfully');
      setAwsSecretKey(''); // Clear secret key field after update
      setBedrockToken(''); // Clear bedrock token field after update
      await loadAWSCredentials();
    } catch (err: any) {
      setAwsError(err.response?.data?.detail || 'Failed to update AWS credentials');
    } finally {
      setAwsSubmitting(false);
    }
  };

  const handleTestAWSCredentials = async () => {
    setAwsError('');
    setAwsSuccess('');
    setAwsTesting(true);

    try {
      const result = await adminAPI.testAWSCredentials();
      if (result.success) {
        setAwsSuccess(result.message);
      } else {
        setAwsError(result.message);
      }
    } catch (err: any) {
      setAwsError(err.response?.data?.detail || 'Failed to test AWS credentials');
    } finally {
      setAwsTesting(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!username || !password) {
      setFormError('Username and password are required.');
      return;
    }

    setSubmitting(true);

    try {
      await adminAPI.createUser({
        username,
        password,
        email: email || null,
        full_name: fullName || null,
        is_admin: isAdmin,
      });
      setFormSuccess('User created successfully.');
      setUsername('');
      setEmail('');
      setFullName('');
      setPassword('');
      setIsAdmin(false);
      await loadUsers();
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white shadow rounded-lg p-6 max-w-md w-full text-center">
          <p className="text-lg text-gray-700 mb-4">{error}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
            <p className="text-sm text-gray-500">Manage users and administrative settings.</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-semibold transition"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">AWS Credentials</h2>
              <p className="text-sm text-gray-500 mt-1">Configure AWS credentials for transcription and AI features</p>
            </div>
            {awsConfigured && (
              <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded-full">
                Configured
              </span>
            )}
          </div>

          <form onSubmit={handleUpdateAWSCredentials} className="space-y-4">
            {awsError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
                {awsError}
              </div>
            )}
            {awsSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded">
                {awsSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">AWS Access Key ID</label>
                <input
                  type="text"
                  value={awsAccessKey}
                  onChange={(e) => setAwsAccessKey(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">AWS Secret Access Key</label>
                <input
                  type="password"
                  value={awsSecretKey}
                  onChange={(e) => setAwsSecretKey(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty to keep current secret key</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">AWS Region</label>
                <select
                  value={awsRegion}
                  onChange={(e) => setAwsRegion(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="us-east-1">US East (N. Virginia) - us-east-1</option>
                  <option value="us-east-2">US East (Ohio) - us-east-2</option>
                  <option value="us-west-1">US West (N. California) - us-west-1</option>
                  <option value="us-west-2">US West (Oregon) - us-west-2</option>
                  <option value="eu-west-1">Europe (Ireland) - eu-west-1</option>
                  <option value="eu-central-1">Europe (Frankfurt) - eu-central-1</option>
                  <option value="ap-south-1">Asia Pacific (Mumbai) - ap-south-1</option>
                  <option value="ap-southeast-1">Asia Pacific (Singapore) - ap-southeast-1</option>
                  <option value="ap-northeast-1">Asia Pacific (Tokyo) - ap-northeast-1</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">S3 Bucket Name</label>
                <input
                  type="text"
                  value={s3Bucket}
                  onChange={(e) => setS3Bucket(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="my-meeting-recordings-bucket"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Bedrock Bearer Token (Optional)</label>
                <input
                  type="password"
                  value={bedrockToken}
                  onChange={(e) => setBedrockToken(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="Bearer token for AWS Bedrock API (if required)"
                />
                <p className="text-xs text-gray-500 mt-1">Optional: Bearer token for Bedrock authentication. Leave empty to use standard AWS credentials.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={awsSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition disabled:bg-gray-400"
              >
                {awsSubmitting ? 'Saving...' : 'Save AWS Credentials'}
              </button>
              <button
                type="button"
                onClick={handleTestAWSCredentials}
                disabled={awsTesting || !awsConfigured}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold transition disabled:bg-gray-400"
              >
                {awsTesting ? 'Testing...' : 'Test Connection'}
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Required AWS Services:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>S3:</strong> Storage for meeting audio files</li>
                <li>• <strong>AWS Transcribe:</strong> Audio transcription with speaker identification</li>
                <li>• <strong>AWS Bedrock:</strong> Claude AI for summaries and action items</li>
              </ul>
            </div>
          </form>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Add New User</h2>
          <form onSubmit={handleCreateUser} className="space-y-4">
            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded">
                {formSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Username *</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="jane.doe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="jane@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Jane Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Password *</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Minimum 8 characters"
                  minLength={8}
                  required
                />
              </div>
            </div>

            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Grant admin access</span>
            </label>

            <div>
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition disabled:bg-gray-400"
              >
                {submitting ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Existing Users</h2>
            <button
              onClick={loadUsers}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold transition"
            >
              Refresh
            </button>
          </div>

          {users.length === 0 ? (
            <p className="text-gray-500">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Full Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admin</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Must Change Password</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.username}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.username}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.full_name || '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email || '—'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.is_admin ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                          {user.is_admin ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.must_change_password ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                          {user.must_change_password ? 'Required' : 'Not required'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}


import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function doLogin(user, pass) {
    setError('');
    setLoading(true);
    try {
      const { data } = await client.post('/auth/login', { username: user, password: pass });
      localStorage.setItem('oee_token', data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    doLogin(username, password);
  }

  async function handleDemo() {
    setUsername('admin');
    setPassword('admin123');
    doLogin('admin', 'admin123');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <form onSubmit={handleSubmit} className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-6 text-center">OEE Box</h1>

        {error && (
          <div className="bg-red-500/20 text-red-400 p-3 rounded mb-4 text-sm">{error}</div>
        )}

        <label className="block text-gray-400 text-sm mb-1">Usuario</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full p-2 mb-4 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
          required
        />

        <label className="block text-gray-400 text-sm mb-1">Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 mb-6 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded transition-colors"
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-gray-800 px-2 text-gray-500">o</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDemo}
          disabled={loading}
          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white font-medium rounded transition-colors"
        >
          🚀 Acceder a Demo
        </button>
      </form>
    </div>
  );
}

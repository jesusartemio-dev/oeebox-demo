import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Config from './pages/Config';
import Andon from './pages/Andon';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('oee_token');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/config" element={<ProtectedRoute><Config /></ProtectedRoute>} />
        <Route path="/andon" element={<Andon />} />
        <Route path="/andon/:code" element={<Andon />} />
      </Routes>
    </BrowserRouter>
  );
}

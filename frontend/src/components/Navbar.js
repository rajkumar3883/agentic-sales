// src/components/Navbar.js (updated)
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Navbar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="bg-blue-600 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="text-xl font-bold">Car Insurance CRM</Link>
        <div className="flex space-x-4">
          <Link to="/" className="hover:text-blue-200">Dashboard</Link>
          <Link to="/leads" className="hover:text-blue-200">Leads</Link>
          <Link to="/leads/new" className="hover:text-blue-200">Add Lead</Link>
          <Link to="/prompts" className="hover:text-blue-200">GPT Prompts</Link>
          <button onClick={handleLogout} className="hover:text-blue-200">Logout</button>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
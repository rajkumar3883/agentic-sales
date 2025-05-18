// src/App.js (updated)
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Registration from './pages/Registration';  // Import the Registration page
import Dashboard from './pages/Dashboard';
import LeadForm from './pages/LeadForm';
import LeadList from './pages/LeadList';
import PromptList from './pages/PromptList';
import PromptForm from './pages/PromptForm';
import PromptView from './pages/PromptView';
import Navbar from './components/Navbar';


// Replace with your Supabase credentials
const supabaseUrl = 'https://druepzwuqtqxnibsfbno.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRydWVwend1cXRxeG5pYnNmYm5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU0MjY1NDEsImV4cCI6MjA2MTAwMjU0MX0.zkA0k-RcZvJwWmllU-iVIgXjSqqMkeKlecNJFKnyeAE';
export const supabase = createClient(supabaseUrl, supabaseKey);

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router basename="/crm">
        <div className="App">
          <Routes>
            <Route path="/login" element={<Login />} />
             <Route path="/register" element={<Registration />} />
            <Route path="/" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <Dashboard />
                </>
              </ProtectedRoute>
            } />
            <Route path="/leads/new" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <LeadForm />
                </>
              </ProtectedRoute>
            } />
            <Route path="/leads/edit/:id" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <LeadForm />
                </>
              </ProtectedRoute>
            } />
            <Route path="/leads" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <LeadList />
                </>
              </ProtectedRoute>
            } />
            {/* GPT Prompt Routes */}
            <Route path="/prompts" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <PromptList />
                </>
              </ProtectedRoute>
            } />
            <Route path="/prompts/new" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <PromptForm />
                </>
              </ProtectedRoute>
            } />
            <Route path="/prompts/edit/:id" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <PromptForm />
                </>
              </ProtectedRoute>
            } />
            <Route path="/prompts/view/:id" element={
              <ProtectedRoute>
                <>
                  <Navbar />
                  <PromptView />
                </>
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
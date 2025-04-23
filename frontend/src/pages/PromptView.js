import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../App';
import { useAuth } from '../contexts/AuthContext';

function PromptView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [prompt, setPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchPrompt = async () => {
      try {
        const { data, error } = await supabase
          .from('gpt_prompts')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();
        
        if (error) throw error;
        
        setPrompt(data);
        
        // Update last_used timestamp
        await supabase
          .from('gpt_prompts')
          .update({ last_used: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', user.id);
      } catch (error) {
        console.error('Error fetching prompt:', error);
        setError('Failed to load prompt data');
      } finally {
        setLoading(false);
      }
    };
    
    if (user) {
      fetchPrompt();
    }
  }, [id, user]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(prompt.content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy:', err);
      });
  };

  if (loading) {
    return <div className="container mx-auto p-4">Loading prompt data...</div>;
  }

  if (error || !prompt) {
    return (
      <div className="container mx-auto p-4">
        <div className="bg-red-100 p-3 rounded mb-4 text-red-700">{error || 'Prompt not found'}</div>
        <button
          onClick={() => navigate('/prompts')}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Back to Prompts
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-4 flex items-center">
        <button
          onClick={() => navigate('/prompts')}
          className="mr-2 text-blue-500"
        >
          ← Back to Prompts
        </button>
        <h1 className="text-2xl font-bold flex-grow">{prompt.title}</h1>
      </div>
      
      <div className="bg-white rounded shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            {prompt.category && (
              <span className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded mr-2">
                {prompt.category}
              </span>
            )}
            {prompt.is_favorite && (
              <span className="text-yellow-500 text-xl">★</span>
            )}
          </div>
          
          <div className="flex space-x-2">
            <Link
              to={`/prompts/edit/${prompt.id}`}
              className="bg-blue-100 text-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-200"
            >
              Edit
            </Link>
            <button
              onClick={copyToClipboard}
              className={`px-3 py-1 rounded text-sm ${
                copied 
                  ? 'bg-green-100 text-green-600' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {copied ? 'Copied!' : 'Copy Content'}
            </button>
          </div>
        </div>
        
        {prompt.description && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Description</h2>
            <p className="text-gray-700">{prompt.description}</p>
          </div>
        )}
        
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Prompt Content</h2>
          <div className="bg-gray-50 p-4 rounded border font-mono whitespace-pre-wrap">
            {prompt.content}
          </div>
        </div>
        
        <div className="text-sm text-gray-500">
          <div>Created: {new Date(prompt.created_at).toLocaleString()}</div>
          <div>Last Updated: {new Date(prompt.updated_at).toLocaleString()}</div>
          {prompt.last_used && (
            <div>Last Used: {new Date(prompt.last_used).toLocaleString()}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PromptView;
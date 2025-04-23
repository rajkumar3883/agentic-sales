import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../App';
import { useAuth } from '../contexts/AuthContext';

function PromptList() {
  const { user } = useAuth();
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  useEffect(() => {
    const fetchPrompts = async () => {
      try {
        const { data, error } = await supabase
          .from('gpt_prompts')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });
        
        if (error) throw error;
        
        setPrompts(data);
        
        // Extract unique categories
        const uniqueCategories = [...new Set(data.map(prompt => prompt.category).filter(Boolean))];
        setCategories(uniqueCategories);
      } catch (error) {
        console.error('Error fetching prompts:', error);
        setError('Failed to load prompts');
      } finally {
        setLoading(false);
      }
    };
    
    if (user) {
      fetchPrompts();
    }
  }, [user]);

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this prompt?')) {
      try {
        const { error } = await supabase
          .from('gpt_prompts')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);
        
        if (error) throw error;
        
        // Update local state
        setPrompts(prompts.filter(prompt => prompt.id !== id));
        setSuccess('Prompt deleted successfully!');
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000);
      } catch (error) {
        console.error('Error deleting prompt:', error);
        setError('Failed to delete prompt');
        
        // Clear error message after 3 seconds
        setTimeout(() => setError(''), 3000);
      }
    }
  };

  const toggleFavorite = async (id, currentValue) => {
    try {
      const { error } = await supabase
        .from('gpt_prompts')
        .update({ is_favorite: !currentValue })
        .eq('id', id)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Update local state
      setPrompts(prompts.map(prompt => 
        prompt.id === id ? { ...prompt, is_favorite: !prompt.is_favorite } : prompt
      ));
    } catch (error) {
      console.error('Error updating favorite status:', error);
      setError('Failed to update favorite status');
      
      // Clear error message after 3 seconds
      setTimeout(() => setError(''), 3000);
    }
  };

  const filteredPrompts = prompts.filter(prompt => {
    const searchMatch = searchTerm.trim() === '' || 
      prompt.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      prompt.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      prompt.content?.toLowerCase().includes(searchTerm.toLowerCase());
      
    const categoryMatch = category === '' || prompt.category === category;
    
    return searchMatch && categoryMatch;
  });

  if (loading) {
    return <div className="container mx-auto p-4">Loading prompts...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">GPT Prompts</h1>
        <Link 
          to="/prompts/new" 
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Add New Prompt
        </Link>
      </div>
      
      {error && <div className="bg-red-100 p-3 rounded mb-4 text-red-700">{error}</div>}
      {success && <div className="bg-green-100 p-3 rounded mb-4 text-green-700">{success}</div>}
      
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search prompts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-grow md:flex-grow-0 md:w-1/3 p-2 border rounded"
        />
        
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="p-2 border rounded"
        >
          <option value="">All Categories</option>
          {categories.map((cat, index) => (
            <option key={index} value={cat}>{cat}</option>
          ))}
        </select>
      </div>
      
      {filteredPrompts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPrompts.map(prompt => (
            <div key={prompt.id} className="bg-white rounded shadow p-4 border-l-4 border-blue-500">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-lg font-semibold">{prompt.title}</h2>
                <button
                  onClick={() => toggleFavorite(prompt.id, prompt.is_favorite)}
                  className={`text-xl ${prompt.is_favorite ? 'text-yellow-500' : 'text-gray-300'}`}
                >
                  ★
                </button>
              </div>
              
              {prompt.category && (
                <div className="mb-2">
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                    {prompt.category}
                  </span>
                </div>
              )}
              
              <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                {prompt.description || 'No description provided'}
              </p>
              
              <div className="bg-gray-50 p-2 rounded mb-3 max-h-20 overflow-hidden">
                <p className="text-sm text-gray-700 line-clamp-3">{prompt.content}</p>
              </div>
              
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>Updated: {new Date(prompt.updated_at).toLocaleDateString()}</span>
                
                <div className="flex space-x-2">
                  <Link
                    to={`/prompts/view/${prompt.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    View
                  </Link>
                  <Link
                    to={`/prompts/edit/${prompt.id}`}
                    className="text-green-600 hover:underline"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(prompt.id)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white p-6 rounded shadow text-center">
          {searchTerm || category ? (
            <p>No prompts found matching your filters.</p>
          ) : (
            <p>No prompts found. Start by adding a new prompt!</p>
          )}
        </div>
      )}
    </div>
  );
}

export default PromptList;
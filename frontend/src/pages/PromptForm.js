import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../App';
import { useAuth } from '../contexts/AuthContext';

function PromptForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEditMode = !!id;
  const [loading, setLoading] = useState(isEditMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [categories, setCategories] = useState([]);
  
  const [prompt, setPrompt] = useState({
    title: '',
    content: '',
    description: '',
    category: '',
    is_favorite: false
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('gpt_prompts')
          .select('category')
          .eq('user_id', user.id)
          .not('category', 'is', null);
        
        if (error) throw error;
        
        // Extract unique categories
        const uniqueCategories = [...new Set(data.map(prompt => prompt.category).filter(Boolean))];
        setCategories(uniqueCategories);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };

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
      } catch (error) {
        console.error('Error fetching prompt:', error);
        setError('Failed to load prompt data');
      } finally {
        setLoading(false);
      }
    };
    
    if (user) {
      fetchCategories();
      if (isEditMode) {
        fetchPrompt();
      }
    }
  }, [id, isEditMode, user]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPrompt({
      ...prompt,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    
    try {
      const timestamp = new Date().toISOString();
      const updatedPrompt = {
        ...prompt,
        updated_at: timestamp,
        user_id: user.id
      };
      
      if (isEditMode) {
        // Update existing prompt
        const { error } = await supabase
          .from('gpt_prompts')
          .update(updatedPrompt)
          .eq('id', id)
          .eq('user_id', user.id);
        
        if (error) throw error;
      } else {
        // Create new prompt
        const { error } = await supabase
          .from('gpt_prompts')
          .insert([{ ...updatedPrompt, created_at: timestamp }]);
        
        if (error) throw error;
      }
      
      setSuccess('Prompt saved successfully!');
      setTimeout(() => {
        navigate('/prompts');
      }, 1500);
    } catch (error) {
      console.error('Error saving prompt:', error);
      setError('Failed to save prompt');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="container mx-auto p-4">Loading prompt data...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">{isEditMode ? 'Edit Prompt' : 'Create New Prompt'}</h1>
      
      {error && <div className="bg-red-100 p-3 rounded mb-4 text-red-700">{error}</div>}
      {success && <div className="bg-green-100 p-3 rounded mb-4 text-green-700">{success}</div>}
      
      <form onSubmit={handleSubmit} className="bg-white rounded shadow p-6">
        <div className="mb-4">
          <label className="block text-gray-700 mb-2" htmlFor="title">
            Title *
          </label>
          <input
            id="title"
            name="title"
            type="text"
            value={prompt.title}
            onChange={handleChange}
            className="w-full p-2 border rounded"
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 mb-2" htmlFor="description">
            Description
          </label>
          <input
            id="description"
            name="description"
            type="text"
            value={prompt.description || ''}
            onChange={handleChange}
            className="w-full p-2 border rounded"
            placeholder="Brief explanation of what this prompt does"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 mb-2" htmlFor="category">
            Category
          </label>
          <div className="flex">
            <input
              list="categories"
              id="category"
              name="category"
              type="text"
              value={prompt.category || ''}
              onChange={handleChange}
              className="w-full p-2 border rounded"
              placeholder="e.g., Lead Generation, Follow-up, Customer Service"
            />
            <datalist id="categories">
              {categories.map((category, index) => (
                <option key={index} value={category} />
              ))}
            </datalist>
          </div>
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 mb-2" htmlFor="content">
            Prompt Content *
          </label>
          <textarea
            id="content"
            name="content"
            value={prompt.content}
            onChange={handleChange}
            className="w-full p-2 border rounded h-64 font-mono"
            required
            placeholder="Enter your GPT prompt template here..."
          ></textarea>
        </div>
        
        <div className="mb-6">
          <label className="flex items-center">
            <input
              name="is_favorite"
              type="checkbox"
              checked={prompt.is_favorite || false}
              onChange={handleChange}
              className="mr-2"
            />
            <span>Mark as Favorite</span>
          </label>
        </div>
        
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate('/prompts')}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded mr-2 hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-blue-300"
          >
            {submitting ? 'Saving...' : 'Save Prompt'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PromptForm;
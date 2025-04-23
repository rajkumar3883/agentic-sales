import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../App';
import { useAuth } from '../contexts/AuthContext';

function LeadList() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  useEffect(() => {
    const fetchLeads = async () => {
      try {
        const { data, error } = await supabase
          .from('leads')
          .select(`
            id, name, email, mobile, car_number, created_at,
            insurance_details(id, active_from, active_to, insurer_company, is_current)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        setLeads(data);
      } catch (error) {
        console.error('Error fetching leads:', error);
        setError('Failed to load leads');
      } finally {
        setLoading(false);
      }
    };
    
    if (user) {
      fetchLeads();
    }
  }, [user]);

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this lead?')) {
      try {
        // Delete the lead (cascade will handle related insurance details)
        const { error } = await supabase
          .from('leads')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);
        
        if (error) throw error;
        
        // Update local state
        setLeads(leads.filter(lead => lead.id !== id));
        setSuccess('Lead deleted successfully!');
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000);
      } catch (error) {
        console.error('Error deleting lead:', error);
        setError('Failed to delete lead');
        
        // Clear error message after 3 seconds
        setTimeout(() => setError(''), 3000);
      }
    }
  };

  const filteredLeads = leads.filter(lead => {
    const searchLower = searchTerm.toLowerCase();
    return (
      lead.name?.toLowerCase().includes(searchLower) ||
      lead.email?.toLowerCase().includes(searchLower) ||
      lead.mobile?.toLowerCase().includes(searchLower) ||
      lead.car_number?.toLowerCase().includes(searchLower)
    );
  });

  // Get current insurance for a lead
  const getCurrentInsurance = (insurances) => {
    return insurances?.find(insurance => insurance.is_current) || null;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return <div className="container mx-auto p-4">Loading leads...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Lead List</h1>
        <Link 
          to="/leads/new" 
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Add New Lead
        </Link>
      </div>
      
      {error && <div className="bg-red-100 p-3 rounded mb-4 text-red-700">{error}</div>}
      {success && <div className="bg-green-100 p-3 rounded mb-4 text-green-700">{success}</div>}
      
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search leads..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-1/3 p-2 border rounded"
        />
      </div>
      
      {filteredLeads.length > 0 ? (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-2 px-4 text-left">Name</th>
                <th className="py-2 px-4 text-left">Contact</th>
                <th className="py-2 px-4 text-left">Car Number</th>
                <th className="py-2 px-4 text-left">Current Insurance</th>
                <th className="py-2 px-4 text-left">Expires</th>
                <th className="py-2 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map(lead => {
                const currentInsurance = getCurrentInsurance(lead.insurance_details);
                
                return (
                  <tr key={lead.id} className="border-t">
                    <td className="py-3 px-4">
                      <div className="font-medium">{lead.name}</div>
                      <div className="text-xs text-gray-500">
                        Added on {formatDate(lead.created_at)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {lead.email && <div>{lead.email}</div>}
                      {lead.mobile && <div>{lead.mobile}</div>}
                    </td>
                    <td className="py-3 px-4">{lead.car_number || 'N/A'}</td>
                    <td className="py-3 px-4">
                      {currentInsurance ? currentInsurance.insurer_company : 'No active insurance'}
                    </td>
                    <td className="py-3 px-4">
                      {currentInsurance ? formatDate(currentInsurance.active_to) : 'N/A'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-center space-x-2">
                        <Link 
                          to={`/leads/edit/${lead.id}`}
                          className="bg-blue-100 text-blue-600 px-3 py-1 rounded text-sm hover:bg-blue-200"
                        >
                          Edit
                        </Link>
                        <button 
                          onClick={() => handleDelete(lead.id)}
                          className="bg-red-100 text-red-600 px-3 py-1 rounded text-sm hover:bg-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white p-6 rounded shadow text-center">
          {searchTerm ? (
            <p>No leads found matching "{searchTerm}".</p>
          ) : (
            <p>No leads found. Start by adding a new lead!</p>
          )}
        </div>
      )}
    </div>
  );
}

export default LeadList;
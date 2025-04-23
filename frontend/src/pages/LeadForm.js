import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../App';
import { useAuth } from '../contexts/AuthContext';

function LeadForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEditMode = !!id;
  const [loading, setLoading] = useState(isEditMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Lead details
  const [lead, setLead] = useState({
    name: '',
    email: '',
    mobile: '',
    car_number: ''
  });
  
  // Insurance details
  const [insurances, setInsurances] = useState([{
    active_from: '',
    active_to: '',
    insurer_company: '',
    is_current: true,
    policy_number: ''
  }]);

  // Fetch lead data if in edit mode
  useEffect(() => {
    if (isEditMode && user) {
      const fetchLead = async () => {
        try {
          // Get lead data
          const { data: leadData, error: leadError } = await supabase
            .from('leads')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();
          
          if (leadError) throw leadError;
          
          // Get insurance details
          const { data: insuranceData, error: insuranceError } = await supabase
            .from('insurance_details')
            .select('*')
            .eq('lead_id', id)
            .order('is_current', { ascending: false });
          
          if (insuranceError) throw insuranceError;
          
          setLead(leadData);
          setInsurances(insuranceData.length > 0 ? insuranceData : [{
            active_from: '',
            active_to: '',
            insurer_company: '',
            is_current: true,
            policy_number: ''
          }]);
        } catch (error) {
          console.error('Error fetching lead:', error);
          setError('Failed to load lead data');
        } finally {
          setLoading(false);
        }
      };
      
      fetchLead();
    }
  }, [id, isEditMode, user]);

  const handleLeadChange = (e) => {
    const { name, value } = e.target;
    setLead(prev => ({ ...prev, [name]: value }));
  };

  const handleInsuranceChange = (index, e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    const updatedInsurances = [...insurances];
    updatedInsurances[index] = { 
      ...updatedInsurances[index], 
      [name]: newValue 
    };
    
    // If setting one as current, set others as not current
    if (name === 'is_current' && newValue === true) {
      updatedInsurances.forEach((insurance, i) => {
        if (i !== index) {
          updatedInsurances[i] = { ...insurance, is_current: false };
        }
      });
    }
    
    setInsurances(updatedInsurances);
  };

  const addInsurance = () => {
    setInsurances([...insurances, {
      active_from: '',
      active_to: '',
      insurer_company: '',
      is_current: false,
      policy_number: ''
    }]);
  };

  const removeInsurance = (index) => {
    if (insurances.length > 1) {
      const updatedInsurances = insurances.filter((_, i) => i !== index);
      // If removing the current insurance, set the first one as current
      if (insurances[index].is_current && updatedInsurances.length > 0) {
        updatedInsurances[0].is_current = true;
      }
      
      setInsurances(updatedInsurances);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    
    try {
      let leadId = id;
      
      // If creating new lead
      if (!isEditMode) {
        const { data: newLead, error: leadError } = await supabase
          .from('leads')
          .insert([{ ...lead, user_id: user.id }])
          .select('id')
          .single();
        
        if (leadError) throw leadError;
        leadId = newLead.id;
      } else {
        // Update existing lead
        const { error: updateError } = await supabase
          .from('leads')
          .update(lead)
          .eq('id', id)
          .eq('user_id', user.id);
        
        if (updateError) throw updateError;
        
        // Delete existing insurance details to replace with current ones
        const { error: deleteError } = await supabase
          .from('insurance_details')
          .delete()
          .eq('lead_id', id);
        
        if (deleteError) throw deleteError;
      }
      
      // Insert insurance details
      const insurancesWithLeadId = insurances.map(insurance => ({
        ...insurance,
        lead_id: leadId
      }));
      
      const { error: insuranceError } = await supabase
        .from('insurance_details')
        .insert(insurancesWithLeadId);
      
      if (insuranceError) throw insuranceError;
      
      setSuccess('Lead saved successfully!');
      setTimeout(() => {
        navigate('/leads');
      }, 1500);
    } catch (error) {
      console.error('Error saving lead:', error);
      setError('Failed to save lead data');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="container mx-auto p-4">Loading lead data...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">{isEditMode ? 'Edit Lead' : 'Add New Lead'}</h1>
      
      {error && <div className="bg-red-100 p-3 rounded mb-4 text-red-700">{error}</div>}
      {success && <div className="bg-green-100 p-3 rounded mb-4 text-green-700">{success}</div>}
      
      <form onSubmit={handleSubmit} className="bg-white rounded shadow p-6">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Lead Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="name">Name *</label>
              <input
                id="name"
                name="name"
                type="text"
                value={lead.name}
                onChange={handleLeadChange}
                className="w-full p-2 border rounded"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={lead.email}
                onChange={handleLeadChange}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="mobile">Mobile Number</label>
              <input
                id="mobile"
                name="mobile"
                type="text"
                value={lead.mobile}
                onChange={handleLeadChange}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-gray-700 mb-2" htmlFor="car_number">Car Number</label>
              <input
                id="car_number"
                name="car_number"
                type="text"
                value={lead.car_number}
                onChange={handleLeadChange}
                className="w-full p-2 border rounded"
              />
            </div>
          </div>
        </div>
        
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Insurance Details</h2>
            <button 
              type="button" 
              onClick={addInsurance}
              className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
            >
              Add Insurance
            </button>
          </div>
          
          {insurances.map((insurance, index) => (
            <div key={index} className="border p-4 rounded mb-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium">Insurance #{index + 1}</h3>
                {insurances.length > 1 && (
                  <button 
                    type="button" 
                    onClick={() => removeInsurance(index)}
                    className="bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 mb-2" htmlFor={`active_from_${index}`}>
                    Active From
                  </label>
                  <input
                    id={`active_from_${index}`}
                    name="active_from"
                    type="date"
                    value={insurance.active_from}
                    onChange={(e) => handleInsuranceChange(index, e)}
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-2" htmlFor={`active_to_${index}`}>
                    Active To
                  </label>
                  <input
                    id={`active_to_${index}`}
                    name="active_to"
                    type="date"
                    value={insurance.active_to}
                    onChange={(e) => handleInsuranceChange(index, e)}
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-2" htmlFor={`insurer_company_${index}`}>
                    Insurer Company
                  </label>
                  <input
                    id={`insurer_company_${index}`}
                    name="insurer_company"
                    type="text"
                    value={insurance.insurer_company}
                    onChange={(e) => handleInsuranceChange(index, e)}
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 mb-2" htmlFor={`policy_number_${index}`}>
                    Policy Number
                  </label>
                  <input
                    id={`policy_number_${index}`}
                    name="policy_number"
                    type="text"
                    value={insurance.policy_number}
                    onChange={(e) => handleInsuranceChange(index, e)}
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center">
                    <input
                      name="is_current"
                      type="checkbox"
                      checked={insurance.is_current}
                      onChange={(e) => handleInsuranceChange(index, e)}
                      className="mr-2"
                    />
                    <span>Current Active Insurance</span>
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate('/leads')}
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded mr-2 hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-blue-300"
          >
            {submitting ? 'Saving...' : 'Save Lead'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LeadForm;
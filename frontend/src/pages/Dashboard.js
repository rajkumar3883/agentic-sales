import React, { useState, useEffect } from 'react';
import { supabase } from '../App';
import { useAuth } from '../contexts/AuthContext';

function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalLeads: 0,
    recentLeads: [],
    upcomingRenewals: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch total leads
        const { data: leadsData, error: leadsError } = await supabase
          .from('leads')
          .select('id')
          .eq('user_id', user.id);
        
        if (leadsError) throw leadsError;
        
        // Fetch recent leads
        const { data: recentLeadsData, error: recentError } = await supabase
          .from('leads')
          .select('id, name, email, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (recentError) throw recentError;
        
        // Fetch upcoming renewals (insurance ending in next 30 days)
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        
        const { data: renewalsData, error: renewalsError } = await supabase
          .from('insurance_details')
          .select(`
            id, active_to, insurer_company, 
            leads!inner(id, name, email, mobile)
          `)
          .eq('is_current', true)
          .lte('active_to', thirtyDaysFromNow.toISOString())
          .gte('active_to', new Date().toISOString())
          .filter('leads.user_id', 'eq', user.id);
        
        if (renewalsError) throw renewalsError;
        
        setStats({
          totalLeads: leadsData.length,
          recentLeads: recentLeadsData,
          upcomingRenewals: renewalsData
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  if (loading) {
    return <div className="container mx-auto p-4">Loading dashboard...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-blue-100 p-6 rounded shadow">
          <h2 className="text-xl font-semibold mb-2">Total Leads</h2>
          <p className="text-3xl font-bold">{stats.totalLeads}</p>
        </div>
        <div className="bg-green-100 p-6 rounded shadow">
          <h2 className="text-xl font-semibold mb-2">Upcoming Renewals</h2>
          <p className="text-3xl font-bold">{stats.upcomingRenewals.length}</p>
        </div>
        <div className="bg-purple-100 p-6 rounded shadow">
          <h2 className="text-xl font-semibold mb-2">Recent Activity</h2>
          <p className="text-3xl font-bold">{stats.recentLeads.length} new leads</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-xl font-semibold mb-4">Recent Leads</h2>
          {stats.recentLeads.length > 0 ? (
            <ul>
              {stats.recentLeads.map(lead => (
                <li key={lead.id} className="border-b py-2">
                  <div className="font-medium">{lead.name}</div>
                  <div className="text-sm text-gray-600">{lead.email}</div>
                  <div className="text-xs text-gray-500">
                    Added on {new Date(lead.created_at).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No recent leads found.</p>
          )}
        </div>
        
        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-xl font-semibold mb-4">Upcoming Renewals</h2>
          {stats.upcomingRenewals.length > 0 ? (
            <ul>
              {stats.upcomingRenewals.map(renewal => (
                <li key={renewal.id} className="border-b py-2">
                  <div className="font-medium">{renewal.leads.name}</div>
                  <div className="text-sm text-gray-600">{renewal.leads.mobile}</div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                      Expires on {new Date(renewal.active_to).toLocaleDateString()}
                    </span>
                    <span className="text-xs font-medium text-blue-600">
                      {renewal.insurer_company}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No upcoming renewals found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
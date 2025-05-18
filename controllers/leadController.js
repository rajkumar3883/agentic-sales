// controllers/leadController.js
const { supabase } = require("../supabase-config");
const logger = require("../logger_conf");
// Create a new lead
exports.createLead = async (req, res) => {
  try {
    const { name, email, mobile, car_number, organization_id, agent_id } =
      req.body;

    // Validate required fields
    if (!name || !mobile) {
      return res.status(400).json({
        success: false,
        error: "Name and mobile are required",
      });
    }
    // Validate required fields
    if (!agent_id) {
      return res.status(400).json({
        success: false,
        error: "Agent_id is required",
      });
    }

    const { data: agent_detail, error: agent_error } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agent_id)
      .single();

    if (agent_error) {
      logger.error("Failed to get agent details:", agent_error);
      return res.status(404).json({
        success: false,
        error: `Agent not found: ${agent_error.message}`,
      });
    }
    // Determine organization ID to use
    const finalOrgId = organization_id || agent_detail.org_id;
    // Check if lead with same mobile and organization_id already exists
    const { data: existingLeads, error: searchError } = await supabase
      .from("leads")
      .select("id, name, mobile")
      .eq("mobile", mobile)
      .eq("organization_id", finalOrgId);

    if (searchError) {
      logger.error("Error checking for duplicate leads:", searchError);
      return res.status(500).json({
        success: false,
        error: `Failed to validate lead uniqueness: ${searchError.message}`,
      });
    }
    // If duplicate found, return error
    if (existingLeads && existingLeads.length > 0) {
      return res.status(409).json({
        success: false,
        error:
          "A lead with this mobile number already exists in this organization",
        existingLead: {
          id: existingLeads[0].id,
          name: existingLeads[0].name,
          mobile: existingLeads[0].mobile,
        },
      });
    }
    // Insert into leads table
    const { data, error } = await supabase
      .from("leads")
      .insert([
        {
          name,
          email,
          mobile,
          car_number: car_number || null,
          organization_id: organization_id || agent_detail.org_id,
          agent_id: agent_id || null,
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      logger.error("Failed to create lead:", error);
      return res.status(500).json({
        success: false,
        error: `Failed to create lead: ${error.message}`,
      });
    }

    res.status(201).json({
      success: true,
      message: "Lead created successfully",
      data: data[0],
    });
  } catch (error) {
    logger.error("Error in createLead:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
};

// Get all leads
exports.getLeads = async (req, res) => {
  try {
    const { status, assigned_to } = req.query;
    let query = supabase.from("leads").select("*");

    // Add filters if provided
    if (status) {
      query = query.eq("status", status);
    }

    if (assigned_to) {
      query = query.eq("assigned_to", assigned_to);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch leads:", error);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch leads: ${error.message}`,
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("Error in getLeads:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
};

// Get lead by ID
exports.getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      logger.error(`Failed to fetch lead with ID ${id}:`, error);
      return res.status(404).json({
        success: false,
        error: "Lead not found",
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("Error in getLeadById:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
};

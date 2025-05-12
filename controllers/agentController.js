// controllers/agentController.js
const { supabase } = require("../supabase-config");
const logger = require("../logger_conf");

// Create a new agent
exports.createAgent = async (req, res) => {
  try {
    const { name, email, mobile, org_id, location } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Name is required",
      });
    }
    if (!mobile) {
      return res.status(400).json({
        success: false,
        error: "Mobile is required",
      });
    }

    // Insert into agents table
    const { data, error } = await supabase
      .from("agents")
      .insert([
        {
          name,
          email,
          mobile,
          location,
          org_id,
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      logger.error("Failed to create agent:", error);
      return res.status(500).json({
        success: false,
        error: `Failed to create agent: ${error.message}`,
      });
    }

    res.status(201).json({
      success: true,
      message: "Agent created successfully",
      data: data[0],
    });
  } catch (error) {
    logger.error("Error in createAgent:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
};

// Get all agents
exports.getAgents = async (req, res) => {
  try {
    const { data, error } = await supabase.from("agents").select("*");

    if (error) {
      logger.error("Failed to fetch agents:", error);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch agents: ${error.message}`,
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("Error in getAgents:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
};

// Get agent by ID
exports.getAgentById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      logger.error(`Failed to fetch agent with ID ${id}:`, error);
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("Error in getAgentById:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
};

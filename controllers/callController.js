// controllers/callController.js
const { supabase } = require("../supabase-config");
const logger = require("../logger_conf");

// Create a new call
exports.createCall = async (req, res) => {
  console.log("in create call...");
  try {
    const {
      lead_id,
      agent_id,
      duration,
      recording_url,
      ai_model,
      tts_service,
      prompt_id,
      policy_id,
      organization_id,
      user_id,
    } = req.body;

    // Validate required fields
    if (!lead_id) {
      return res.status(400).json({
        success: false,
        error: "Lead ID is required",
      });
    }
    // Validate required fields
    if (!agent_id) {
      return res.status(400).json({
        success: false,
        error: "Agent ID is required",
      });
    }

    // Insert into calls table
    const { data, error } = await supabase
      .from("calls")
      .insert([
        {
          lead_id,
          agent_id,
          duration,
          recording_url: recording_url || null,
          user_id: user_id || null,
          organization_id: organization_id || null,
          ai_model: ai_model || null,
          tts_service: tts_service || null,
          prompt_id: prompt_id || null,
          policy_id: policy_id || null,
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      logger.error("Failed to create call:", error);
      return res.status(500).json({
        success: false,
        error: `Failed to create call: ${error.message}`,
      });
    }

    res.status(201).json({
      success: true,
      message: "Call created successfully",
      data: data[0],
    });
  } catch (error) {
    logger.error("Error in createCall:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
};

// Get all calls
exports.getCalls = async (req, res) => {
  try {
    const { lead_id, agent_id } = req.query;
    let query = supabase.from("calls").select("*");

    // Add filters if provided
    if (lead_id) {
      query = query.eq("lead_id", lead_id);
    }

    if (agent_id) {
      query = query.eq("agent_id", agent_id);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch calls:", error);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch calls: ${error.message}`,
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("Error in getCalls:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
};

// Get call by ID
exports.getCallById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("calls")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      logger.error(`Failed to fetch call with ID ${id}:`, error);
      return res.status(404).json({
        success: false,
        error: "Call not found",
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("Error in getCallById:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
};

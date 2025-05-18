// routes/admin.js
const express = require("express");
const router = express.Router();
const { generateApiKey } = require("../middleware/auth");
const { supabase } = require("../supabase-config");
const logger = require("../logger_conf");

// Simple admin authentication middleware
// In a production environment, you should use a more robust authentication method
const authenticateAdmin = async (req, res, next) => {
  try {
    const adminToken = req.headers["x-admin-token"];

    if (!adminToken || adminToken !== process.env.ADMIN_API_TOKEN) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    next();
  } catch (error) {
    logger.error("Admin authentication error:", error);
    res.status(500).json({
      success: false,
      error: "Authentication failed",
    });
  }
};

// Protect all admin routes
router.use(authenticateAdmin);

// Generate a new API key
router.post("/api-keys", generateApiKey);

// List all API keys
router.get("/api-keys", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, created_by, created_at, last_used, is_active, scopes")
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Failed to fetch API keys:", error);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch API keys: ${error.message}`,
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error("Error listing API keys:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
});

// Revoke/disable an API key
router.put("/api-keys/:id/revoke", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", id)
      .select();

    if (error) {
      logger.error(`Failed to revoke API key ${id}:`, error);
      return res.status(500).json({
        success: false,
        error: `Failed to revoke API key: ${error.message}`,
      });
    }

    res.json({
      success: true,
      message: "API key revoked successfully",
      data: data[0],
    });
  } catch (error) {
    logger.error("Error revoking API key:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
});

module.exports = router;

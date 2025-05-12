// middleware/auth.js
const { supabase } = require("../supabase-config");
const logger = require("../logger_conf");
const created_by = process.env.ADMIN_USER_ID;
/**
 * Middleware to authenticate API requests using API keys
 */
exports.authenticateApiKey = async (req, res, next) => {
  try {
    // Get API key from request headers
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: "API key is required",
      });
    }

    // Check API key in the database
    const { data, error } = await supabase
      .from("api_keys")
      .select("*")
      .eq("key", apiKey)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      logger.warn(`Invalid API key attempt: ${apiKey}`);
      return res.status(401).json({
        success: false,
        error: "Invalid or inactive API key",
      });
    }

    // Update last used timestamp
    await supabase
      .from("api_keys")
      .update({ last_used: new Date().toISOString() })
      .eq("id", data.id);

    // Add API key data to request for potential use in controllers
    req.apiKey = {
      id: data.id,
      name: data.name,
      created_by: data.created_by || created_by,
      scopes: data.scopes || ["read", "write"],
    };

    // Continue to the next middleware or route handler
    next();
  } catch (error) {
    logger.error("Authentication error:", error);
    res.status(500).json({
      success: false,
      error: "Authentication failed",
    });
  }
};

/**
 * Generate a new API key
 * This would typically be used in an admin route
 */
exports.generateApiKey = async (req, res) => {
  try {
    const { name, scopes } = req.body;

    if (!name || !created_by) {
      return res.status(400).json({
        success: false,
        error: "Name and creator ID are required",
      });
    }

    // Generate a random API key
    const key = generateRandomKey(32);

    // Store in database
    const { data, error } = await supabase
      .from("api_keys")
      .insert([
        {
          name,
          key,
          scopes: scopes || ["read", "write"],
          created_by,
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      logger.error("Failed to create API key:", error);
      return res.status(500).json({
        success: false,
        error: `Failed to create API key: ${error.message}`,
      });
    }

    // Return the new API key (only time it will be visible in full)
    res.status(201).json({
      success: true,
      message: "API key created successfully",
      data: {
        id: data[0].id,
        name: data[0].name,
        key, // Full key is only returned once
        scopes: data[0].scopes,
        created_at: data[0].created_at,
      },
    });
  } catch (error) {
    logger.error("Error generating API key:", error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`,
    });
  }
};

// Helper function to generate a random API key
function generateRandomKey(length = 32) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomValues[i] % chars.length);
  }

  return result;
}

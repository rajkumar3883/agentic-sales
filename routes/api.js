// routes/api.js
const express = require("express");
const router = express.Router();
const { authenticateApiKey } = require("../middleware/auth");
const {
  createAgent,
  getAgents,
  getAgentById,
} = require("../controllers/agentController");

const {
  createCall,
  getCalls,
  getCallById,
} = require("../controllers/callController");

const {
  createLead,
  getLeads,
  getLeadById,
} = require("../controllers/leadController");

// Protect all routes in this router with API key authentication
router.use(authenticateApiKey);

// Agent routes
router.post("/agents", createAgent);
router.get("/agents", getAgents);
router.get("/agents/:id", getAgentById);

// Call routes
console.log("in routes");
router.post("/calls", createCall);
// router.get("/calls", getCalls);
// router.get("/calls/:id", getCallById);

// Lead routes
router.post("/leads", createLead);
router.get("/leads", getLeads);
router.get("/leads/:id", getLeadById);

module.exports = router;

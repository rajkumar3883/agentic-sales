// supabase-config.js
const { createClient } = require("@supabase/supabase-js");

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Function to ensure storage bucket exists
async function ensureStorageBucket(bucketName = "call-recordings") {
  try {
    console.log(`Checking if ${bucketName} bucket exists...`);
    const { data, error } = await supabase.storage.getBucket(bucketName);

    if (error && (error.statusCode === 404 || error.code === "PGRST116")) {
      console.log(`Bucket ${bucketName} not found, creating...`);
      const { data: newBucket, error: createError } =
        await supabase.storage.createBucket(bucketName, {
          public: false,
        });

      if (createError) {
        console.error(`Error creating bucket ${bucketName}:`, createError);
      } else {
        console.log(`Created ${bucketName} bucket successfully`);
      }
    } else if (error) {
      console.error(`Error checking bucket ${bucketName}:`, error);
    } else {
      console.log(`${bucketName} bucket exists`);
    }
  } catch (err) {
    console.error("Error in ensureStorageBucket:", err);
  }
}

// Add any other Supabase-related utility functions here
async function initSupabase() {
  try {
    // Initialize any required resources
    await ensureStorageBucket("call-recordings");
    console.log("Supabase initialization complete");
  } catch (err) {
    console.error("Failed to initialize Supabase:", err);
  }
}

module.exports = {
  supabase,
  ensureStorageBucket,
  initSupabase,
};

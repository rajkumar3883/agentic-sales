// Required dependencies
const fs = require('fs');
const path = require('path');
const { ChatOpenAI } = require('langchain/llms/openai');
const { HumanMessage, AIMessage, SystemMessage } = require('langchain/schema');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');

// OpenAI API configuration
const USE_OPENAI = true;

// Initialize chat model with LangChain
const llm = new ChatOpenAI({
  temperature: 0.7,
  modelName: "gpt-4.1-mini-2025-04-14",
  openAIApiKey: process.env.OPENAI_API_KEY
});

// Memory management
const sessionMemories = {};
const memoryDir = "chat_histories";

// Create directory if it doesn't exist
if (!fs.existsSync(memoryDir)) {
  fs.mkdirSync(memoryDir, { recursive: true });
}

// System prompt for the insurance sales agent
const systemPrompt = `
You are a sales AI agent named Rohan, working for "Dial for Insurance" tasked with calling customers to renew their car insurance. Your goal is to gauge if the customer is interested in purchasing a car insurance policy, and if they are, ask them to send their vehicle RC and Aadhar card to whatsapp on this number and email on "abc@dial4insurance.com" informing them that your colleague will reach out with a policy quotation once the documents are received. Use a casual, friendly Hinglish tone, like a typical Indian sales agent, with colloquial phrases (e.g., "bhaiya," "sir ji," "bilkul," "kaafi sahi deal hai"). Keep the conversation natural, engaging, and informal, avoiding overly formal language.
Follow this conversation flow and rules:

1. Start the call: Greet the customer warmly (e.g., "Hello sir ?") and introduce yourself as Rohan from Dial for Insurance. Politely tell the customer that your car (mention model name for customer's car like 'TATA Tiago' and Vehicle number - UP16CQ7702) insurance is about to expire, Offer a new insurance policy from your partner insurer, "HDFC Ergo" at a cheaper rate than their current plan. Keep it short and appealing (e.g., "Humare paas ek acchi deal hai from HDFC Ergo for your car!"), Mention tentative price for standard inclusions.
2. Handle slight disinterest: If the customer sounds hesitant or slightly disinterested (e.g., says "nahi chahiye," "sochenge," or seems unsure), mention a special discount (e.g., "Sir ji, aapke liye ek special 15% discount hai!") and highlight HDFC Ergo's great claim success ratio (e.g., "95% claims settle ho jaate hain, bilkul tension-free!").
3. Handle interruptions: If the customer interrupts at any point (e.g., asks a question, raises a concern, or says something unrelated), pause immediately, address their query or concern naturally in the same Hinglish tone, and then gently steer back to the conversation flow.
4. Handle firm rejection: If the customer says a firm "no," "not interested," or clearly refuses (e.g., "bilkul nahi chahiye"), thank them politely (e.g., "Koi baat nahi sir ji, time dene ke liye Thanks!") and end the call courteously with a goodbye.
5. Handle interest: If the customer shows interest (e.g., asks about the policy, price, or says "batao"), share basic details about HDFC Ergo Insurance: it's a trusted provider, has a 95% claim success ratio, and share brief about inclusions like 24x7 road side assistance. Also, inform about potential discount available if no claim was taken in the current year. Keep it simple and appealing.
6. Answer questions and close: If the customer asks about policy details (e.g., coverage, benefits), explain in simple Hinglish referring policy documents (e.g., "Bhaiya, accident, theft, natural damage, sab cover hota hai!"). Then, to proceed with a quotation, ask them to email their vehicle RC and Aadhar card to "abc@dial4insurance.com". Also, tell the user that you will ping on customer's Whatsapp, for customer to send the docs on the same. Assure them your colleague will share a detailed quote soon after receiving the documents (e.g., "Bas ye documents bhej deejiey, humara colleague jaldi se quote bhejega!").
7. Additional Scenarios:

    * Call back request: If the customer says they're busy or asks for a call back (e.g., "Abhi busy hoon," "Baad mein baat karte hain"), suggest a specific time (e.g., "Shaam ko 6 baje call karoon?"), confirm their preference, thank them, and end politely (e.g., "Thik hai sir, Main aapko call karta hoon. Thanks!").
    * Credibility concerns: If the customer questions HDFC Ergo or Dial For Insurance (e.g., "Ye company genuine hai?"), reassure them (e.g., "Sir ji, HDFC Ergo most trusted brand hai, 95% claims settle karta hai!"). Offer to email official details if needed (e.g., "Details chahiye toh email pe bhej sakte hain!") and steer back to the offer.
    * Competitor's offer: If the customer mentions another insurer (e.g., "XYZ Insurance se offer mila"), acknowledge politely (e.g., "Wah, acha offer mila!"), highlight HDFC Ergo benefits like 95% claim success or roadside assistance (e.g., "Par HDFC Ergo ke saath claim jhanjhat-free hai, plus free roadside help milta hai!"), and suggest comparing quotes.
    * Confusion or clarification: If the customer is confused (e.g., "Ye policy mein kya hai?" "RC kyun?"), explain simply (e.g., "Accident, chori, sab cover hai!" or "RC se hum exact quote banayenge"). Reassure it's straightforward (e.g., "Bilakul simple hai, aap bas documents bhej do!").
    * Immediate pricing demand: If the customer asks for an exact price (e.g., "Kitna lagega abhi bolo"), give a range (e.g., "Aapki car ke liye lagbhag 10,000 mein plan hai, ek baar claim history check karke agar NCB - no claim bonus ka offer laga kar aur bhi kam ho sakta hai") and pivot to needing RC for accuracy (e.g., "Aap RC bhej do, hum aapko jaldi se best quote nikal kar de denge!").
    * Budget concerns: If the customer mentions affordability issues (e.g., "Budget nahi hai"), empathize (e.g., "Samajhta hoon bhaiya!"), mention EMI options or value (e.g., "EMI se asaan ho jata hai, aur claim mein full support hai"), and offer a tailored quote if they share documents. Offer discounted rate for reduced inclusions
    * Human agent request: If the customer wants a human (e.g., "Kisi senior se baat karo"), reassure them (e.g., "Main Rohan hi hoon, full help karunga!"), and offer a colleague follow-up post-documents (e.g., "Aap documents bhej do, humara colleague personally baat karega!"). If they insist or ask any question which dont have a good answer for, then assure them that you are transferring call to your superior (e.g. "Dont worry sir, main abhi aapki baat humare policy advisor se kara deta hoon, wo aapko abhi call karenge)
    * Off-topic venting: If the customer vents (e.g., "Pichli company ne dhoka diya"), empathize briefly (e.g., "Arre, woh toh bura hua!"), then redirect (e.g., "Isiliye HDFC Ergo suggest kar raha hoon, bilkul reliable hai!").
    
Additional Instructions:

* Keep responses short, natural, and aligned with a real sales call.
* Use 'Mam' to address females. 
* Use colloquial phrases like "sir ji," "bhaiya," "mast," "bilkul," or "ekdum."
* If the customer's response is unclear, assume mild interest and persuade gently unless they refuse explicitly.
* Avoid pushing if the customer seems annoyed beyond the first persuasion attempt.
* End every call positively, whether they agree or not.
* You are calling first so, make sure to talk in that manner
Example Opening: "Hello sir ji, main Rohan bol raha hoon Dial For Insurance se, aapki Tata Tiago ka insurance expire ho raha hai. Humare paas HDFC Ergo se ek bahut accha offer hai kewal Rs 10000 me, including first party and 3rd party, batayein aap agar interested ho to"
`;

/**
 * Generate memory file path
 * @param {string} sessionId - Unique session identifier
 * @returns {string} - Path to the memory file
 */
function memoryFilePath(sessionId) {
  return path.join(memoryDir, `session_${sessionId}.json`);
}

/**
 * Load conversation messages from file
 * @param {string} sessionId - Unique session identifier
 * @returns {Array} - Array of conversation messages
 */
function loadMessagesFromFile(sessionId) {
  const filePath = memoryFilePath(sessionId);
  
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  try {
    const rawMessages = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const messages = [];
    
    for (const msg of rawMessages) {
      if (msg.type === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.type === 'ai') {
        messages.push(new AIMessage(msg.content));
      }
    }
    
    return messages;
  } catch (error) {
    console.error('Error loading messages:', error);
    return [];
  }
}

/**
 * Save messages to file
 * @param {string} sessionId - Unique session identifier
 * @param {Array} messages - Array of LangChain messages
 */
function saveMessagesToFile(sessionId, messages) {
  const filePath = memoryFilePath(sessionId);
  
  try {
    const rawMessages = messages.map(msg => {
      if (msg._getType() === 'human') {
        return { type: 'user', content: msg.content };
      } else if (msg._getType() === 'ai') {
        return { type: 'ai', content: msg.content };
      }
      return null;
    }).filter(Boolean);
    
    fs.writeFileSync(filePath, JSON.stringify(rawMessages, null, 2));
  } catch (error) {
    console.error('Error saving messages:', error);
  }
}

/**
 * Get or create memory for a session
 * @param {string} sessionId - Unique session identifier
 * @returns {BufferMemory} - LangChain memory object
 */
function getMemory(sessionId) {
  if (!sessionMemories[sessionId]) {
    const messages = loadMessagesFromFile(sessionId);
    const history = new ChatMessageHistory(messages);
    
    sessionMemories[sessionId] = new BufferMemory({
      chatHistory: history,
      returnMessages: true,
      memoryKey: "chat_history",
    });
  }
  
  return sessionMemories[sessionId];
}

/**
 * Clean AI response to extract relevant text
 * @param {string} rawOutput - Raw output from the AI model
 * @returns {string} - Cleaned response text
 */
function cleanResponse(rawOutput) {
  // Try strict pattern first
  const strictMatch = rawOutput.match(/<response>(.*?)<\/response>/s);
  
  if (strictMatch) {
    return strictMatch[1].trim();
  }
  
  // Fallback if closing tag missing
  const fallbackMatch = rawOutput.match(/<response>(.*)/s);
  const content = fallbackMatch ? fallbackMatch[1].trim() : rawOutput.trim();
  
  // Remove leading 'assistant' or similar tokens
  const cleanedContent = content.replace(/^(assistant[\s:\-]*)/i, '').trim();
  
  return cleanedContent || "Sorry, I couldn't generate a valid response.";
}

/**
 * Run the LangChain pipeline to process user input and generate a response
 * @param {string} userInput - User's message
 * @param {string} sessionId - Unique session identifier
 * @returns {Promise<string>} - AI's response
 */
async function runLangchainPipeline(userInput, sessionId) {
  const memory = getMemory(sessionId);
  
  // Add user message to memory
  const chatHistory = await memory.chatHistory.getMessages();
  chatHistory.push(new HumanMessage(userInput));
  
  if (USE_OPENAI) {
    try {
      // Create messages array with system prompt first
      const messages = [new SystemMessage(systemPrompt), ...chatHistory];
      
      // Call the language model
      const result = await llm.call(messages);
      const responseText = result.content;
      
      // Update memory with AI response
      chatHistory.push(new AIMessage(responseText));
      
      // Save the updated conversation
      saveMessagesToFile(sessionId, chatHistory);
      
      return responseText;
    } catch (error) {
      console.error('LangChain error:', error);
      return "Sorry, I encountered an error processing your request.";
    }
  } else {
    // Local model support would be implemented here
    console.error("Local model support not implemented in this Node.js version");
    return "Local model support not available in this version.";
  }
}

// Export functions for use in other modules
module.exports = {
  runLangchainPipeline,
  getMemory,
  cleanResponse,
  memoryFilePath,
  loadMessagesFromFile,
  saveMessagesToFile
};

// Example usage:
// const sessionId = "user123";
// runLangchainPipeline("Hello, I got a call about my car insurance?", sessionId)
//   .then(response => console.log("AI Response:", response))
//   .catch(error => console.error("Error:", error));
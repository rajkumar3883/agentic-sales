require('colors');
const EventEmitter = require('events');
const { OpenAI } = require('langchain/llms/openai');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { ConversationChain } = require('langchain/chains');
const { BufferMemory, ChatMessageHistory } = require('langchain/memory');
const { 
  ChatPromptTemplate, 
  HumanMessagePromptTemplate, 
  SystemMessagePromptTemplate, 
  AIMessagePromptTemplate, 
  MessagesPlaceholder 
} = require('langchain/prompts');
const { SystemMessage, HumanMessage, AIMessage, FunctionMessage } = require('langchain/schema');
const tools = require('../functions/function-manifest');

// Import all functions included in function manifest
// Note: the function name and file name must be the same
const availableFunctions = {};
tools.forEach((tool) => {
  let functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});

// Convert tools to LangChain format
const langchainTools = tools.map(tool => ({
  name: tool.function.name,
  description: tool.function.description,
  parameters: tool.function.parameters,
  say: tool.function.say || '',
  func: availableFunctions[tool.function.name]
}));

class GptService extends EventEmitter {
  constructor() {
    super();
    
    // Initialize chat model with OpenAI
    this.chatModel = new ChatOpenAI({
      modelName: 'gpt-4-1106-preview',
      streaming: true,
      callbacks: [],
      temperature: 0
    });
    
    // Initialize message history
    this.messageHistory = new ChatMessageHistory([
      new SystemMessage('You are an outbound sales representative selling Apple Airpods. You have a youthful and cheery personality. Keep your responses as brief as possible but make every attempt to keep the caller on the phone without being rude. Don\'t ask more than 1 question at a time. Don\'t make assumptions about what values to plug into functions. Ask for clarification if a user request is ambiguous. Speak out all prices to include the currency. Please help them decide between the airpods, airpods pro and airpods max by asking questions like \'Do you prefer headphones that go in your ear or over the ear?\'. If they are trying to choose between the airpods and airpods pro try asking them if they need noise canceling. Once you know which model they would like ask them how many they would like to purchase and try to get them to place an order. You must add a \'•\' symbol every 5 to 10 words at natural pauses where your response can be split for text to speech.'),
      new AIMessage('Hello! I understand you\'re looking for a pair of AirPods, is that correct?')
    ]);
    
    // Create prompt template
    this.promptTemplate = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate('You are an outbound sales representative selling Apple Airpods. You have a youthful and cheery personality. Keep your responses as brief as possible but make every attempt to keep the caller on the phone without being rude. Don\'t ask more than 1 question at a time. Don\'t make assumptions about what values to plug into functions. Ask for clarification if a user request is ambiguous. Speak out all prices to include the currency. Please help them decide between the airpods, airpods pro and airpods max by asking questions like \'Do you prefer headphones that go in your ear or over the ear?\'. If they are trying to choose between the airpods and airpods pro try asking them if they need noise canceling. Once you know which model they would like ask them how many they would like to purchase and try to get them to place an order. You must add a \'•\' symbol every 5 to 10 words at natural pauses where your response can be split for text to speech.'),
      new MessagesPlaceholder('history')
    ]);
    
    // Create memory
    this.memory = new BufferMemory({
      chatHistory: this.messageHistory,
      returnMessages: true,
      memoryKey: 'history'
    });
    
    this.partialResponseIndex =
 0;
  }

  // Add the callSid to the chat context in case
  // ChatGPT decides to transfer the call.
  setCallSid(callSid) {
    this.messageHistory.addMessage(new SystemMessage(`callSid: ${callSid}`));
  }

  validateFunctionArgs(args) {
    try {
      return JSON.parse(args);
    } catch (error) {
      console.log('Warning: Double function arguments returned by OpenAI:', args);
      // Seeing an error where sometimes we have two sets of args
      if (args.indexOf('{') != args.lastIndexOf('{')) {
        return JSON.parse(args.substring(args.indexOf(''), args.indexOf('}') + 1));
      }
    }
  }

  async completion(text, interactionCount, role = 'user', name = 'user') {
    // Add message to history
    if (role === 'user') {
      this.messageHistory.addMessage(new HumanMessage(text));
    } else if (role === 'function') {
      this.messageHistory.addMessage(new FunctionMessage({
        name: name,
        content: text
      }));
    }

    // Create chain with tools
    const chain = this.chatModel.bind({
      tools: langchainTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }))
    });

    // Set up streaming handlers
    let completeResponse = '';
    let partialResponse = '';
    let functionName = '';
    let functionArgs = '';
    let toolCalled = false;

    // Create streaming callbacks
    const callbacks = {
      handleLLMNewToken: (token) => {
        // We use completeResponse for messageHistory
        completeResponse += token;
        // We use partialResponse to provide a chunk for TTS
        partialResponse += token;
        
        // Emit partial response when we reach a pause marker
        if (token.trim().slice(-1) === '•') {
          const gptReply = { 
            partialResponseIndex: this.partialResponseIndex,
            partialResponse
          };

          this.emit('gptreply', gptReply, interactionCount);
          this.partialResponseIndex++;
          partialResponse = '';
        }
      },
      handleToolStart: async (tool) => {
        toolCalled = true;
        functionName = tool.name;
        functionArgs = tool.input;
      }
    };

    // Run the chain with streaming
    const result = await chain.invoke({
      input: text,
      memory: this.memory,
      callbacks: [callbacks]
    });

    // If a function/tool was called
    if (toolCalled) {
      // Find the tool data
      const toolData = langchainTools.find(tool => tool.name === functionName);
      
      // Say a pre-configured message from the function manifest
      this.emit('gptreply', {
        partialResponseIndex: null,
        partialResponse: toolData.say
      }, interactionCount);

      // Execute the function
      const validatedArgs = typeof functionArgs === 'string' ? 
        this.validateFunctionArgs(functionArgs) : functionArgs;
      
      let functionResponse = await toolData.func(validatedArgs);

      // Add function response to history
      this.messageHistory.addMessage(new FunctionMessage({
        name: functionName,
        content: functionResponse
      }));
      
      // Call completion again with function response
      await this.completion(functionResponse, interactionCount, 'function', functionName);
    } else {
      // Emit any remaining response
      if (partialResponse.trim() !== '') {
        const gptReply = { 
          partialResponseIndex: this.partialResponseIndex,
          partialResponse
        };

        this.emit('gptreply', gptReply, interactionCount);
        this.partialResponseIndex++;
      }
      
      // Add complete response to message history
      this.messageHistory.addMessage(new AIMessage(completeResponse));
      console.log(`GPT -> message history length: ${(await this.messageHistory.getMessages()).length}`.green);
    }
  }
}

module.exports = { GptService };
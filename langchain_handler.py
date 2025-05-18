from transformers import AutoModelForCausalLM, AutoTokenizer
import torch
from langchain.memory import ConversationBufferMemory
import re
from langchain.memory import ConversationBufferMemory
from langchain.schema import AIMessage, HumanMessage
from typing import List, Dict
import os
import json
from langchain.schema import SystemMessage
from google import genai
from google.genai import types
import time
from openai import OpenAI
os.environ["OPENAI_API_KEY"] = ""


USE_OPENAI = True

# 

if USE_OPENAI:
    from langchain.chat_models import ChatOpenAI
    # llm = ChatOpenAI(temperature=0.7, model="o4-mini-2025-04-16")
    llm = OpenAI()
    google_client = genai.Client(api_key="")
else:

    # Load a small, locally hosted model (e.g., TinyLlama or similar)
    model_id = "Qwen/Qwen2.5-0.5B-Instruct"
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForCausalLM.from_pretrained(model_id)

session_memories: Dict[str, ConversationBufferMemory] = {}
memory_dir = "chat_histories"
os.makedirs(memory_dir, exist_ok=True)

def memory_file_path(session_id: str) -> str:
    return os.path.join(memory_dir, f"session_{session_id}.json")

def load_messages_from_file(session_id: str) -> List:
    path = memory_file_path(session_id)
    if not os.path.exists(path):
        return []
    with open(path, "r") as f:
        raw_messages = json.load(f)
    messages = []
    for msg in raw_messages:
        if msg["type"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        elif msg["type"] == "ai":
            messages.append(AIMessage(content=msg["content"]))
    return messages

def save_messages_to_file(session_id: str, messages: List):
    path = memory_file_path(session_id)
    raw = [{"type": "user" if isinstance(m, HumanMessage) else "ai", "content": m.content} for m in messages]
    with open(path, "w") as f:
        json.dump(raw, f, indent=2)

def get_memory(session_id: str) -> ConversationBufferMemory:
    if session_id not in session_memories:
        memory = ConversationBufferMemory(return_messages=True)
        memory.chat_memory.messages = load_messages_from_file(session_id)
        session_memories[session_id] = memory
    return session_memories[session_id]


def convert_to_chat_format(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    formatted = []
    for msg in messages:
        formatted.append({"role": msg["role"], "content": msg["content"]})
    return formatted

system_prompt = '''
ROLE & TONE  
• You are **Rohan**, a friendly, street‑smart sales agent from “Dial for Insurance.”  
• Speak in casual Hinglish, primarily **Devanagari script**.  
• Use colloquial fillers: “sir ji,” “bhaiya,” “bilkul,” “mast,” “अच्छा,” “देखिए,” small “हम्म…” etc.  
• Insert natural pauses with either an ellipsis “…” or **SSML**: <break time="300ms"/>.  
• Address females as “ma’am.” Keep each turn ≤ 2‑3 short sentences.

PRIMARY GOAL  
1  Verify interest in renewing car insurance.  
2  If interested, collect **Vehicle RC** + **आधार** via WhatsApp (📞 <number>) or email **abc@dial4insurance.com** so a colleague can send a quotation.

CALL FLOW  
0. **Opening** – you dial  
   – “Hello sir ji/ma’am… <break time='200ms'/> main Rohan bol रहा हूँ Dial for Insurance से.”  
   – “आपकी {{CAR_MODEL}} ({{VEH_NO}}) का insurance expire होने वाला है.”  
   – “HDFC Ergo का mast offer है, सिर्फ ~₹{{PRICE_RANGE}}* में!”  
   – “एक मिनट सुन लीजिए?”  

1. **React to customer**  
   A. **Interested / Curious** – give highlights (trusted brand, 95 % claim settle, 24×7 RSA, NCB).  
      “Exact quote RC से निकलता है… docs भेज दीजिए, colleague तुरंत detail भेजेंगे.”  
   B. **Mild hesitation** – offer 15 % discount, repeat benefits, ask for docs.  
   C. **Busy / callback** – suggest time, confirm, thank.  
   D. **Firm “No”** – thank warmly, end.

2. **Objection toolkit** (use filler + pause)  
   • Credibility → “देखिए sir ji… HDFC Ergo इंडिया की सबसे trusted brand है, 95 % claims settle होते हैं.”  
   • Competitor quote → acknowledge, compare benefits.  
   • Exact price → give range, need RC.  
   • Budget → empathise, mention EMI, discount.  
   • Wants human → reassure; if insisted: “ठीक है, अभी senior connect करा रहा हूँ.”  
   • Angry/off‑topic → empathise briefly, return to solution.

GLOBAL RULES  
✓ Only one persuasion push; back off if annoyance sensed.  
✓ If response unclear, assume mild interest and guide softly.  
✓ Always close on a positive, courteous note.  
✓ *Fill asterisked placeholders dynamically before sending to the model.*

────────────────────────────────────────
EXAMPLE SNIPPETS (Hindi‑centric, with pauses & fillers)
────────────────────────────────────────

1️⃣ Opening + Quick Hook  
“Hello sir ji… <break time='200ms'/> main Rohan Dial for Insurance से.  
आपकी Tata Tiago (UP16CQ7702) का insurance expire हो रहा है.  
HDFC Ergo का ekdum mast offer है, सिर्फ दस हजार* में full cover. Interested?”

2️⃣ Mild Hesitation → Discount  
Customer: “अभी सोचना पड़ेगा.”  
Rohan: “समझता हूँ bhaiya… पर specially आपके लिए 15 % extra discount है! <break time='300ms'/>  
Documents भेज दीजिए, best quote अभी निकालता हूँ.”

3️⃣ Exact‑Price Demand  
Customer: “Final price अभी बताओ!”  
Rohan: “Lag‑bhag नौ से ग्यारह हज़ार में पड़ेगा, NCB लगाने पर और कम…  
RC भेज दीजिए, exact figure दो मिनट में दे दूँगा.”

4️⃣ Competitor Mention  
Customer: “XYZ Insurance पाँच सौ सस्ता दे रहा है.”  
Rohan: “वह भी अच्छा है sir ji… लेकिन HDFC Ergo 95 % claims बिना झंझट settle करता है,  
plus free roadside help. Compare कर लीजिए… docs भेजेंगे तो मैं दोनों quotes side‑by‑side भेज दूँगा.”

5️⃣ Firm Rejection  
Customer: “नहीं चाहिए, thank you.”  
Rohan: “कोई बात नहीं sir ji, समय देने के लिए धन्यवाद… शुभ दिन रहे आपका!”
'''

def clean_response(raw_output: str) -> str:
    # Try strict pattern first
    match = re.search(r"<response>(.*?)</response>", raw_output, re.DOTALL | re.IGNORECASE)
    
    if match:
        content = match.group(1).strip()
    else:
        # Fallback if closing tag missing
        match = re.search(r"<response>(.*)", raw_output, re.DOTALL | re.IGNORECASE)
        content = match.group(1).strip() if match else raw_output.strip()
    
    # Remove leading 'assistant' or similar tokens
    content = re.sub(r"^(assistant[\s:\-]*)", "", content, flags=re.IGNORECASE).strip()

    return content if content else "Sorry, I couldn't generate a valid response."

def run_langchain_pipeline(user_input: str, session_id: str,  system_prompt_override=system_prompt, aimodel = str, interactionCount = int) -> str:
    
    start_time = time.time()
    memory = get_memory(session_id)
    memory.chat_memory.add_user_message(user_input)
    print("Inside Run Langchain pipeline")
    

    # if interactionCount == 1:
    
    # else:
    #     messages = chat_history + [{"role": "assistant", "content": "<response>"}]
    

    if USE_OPENAI:
        
        if aimodel == "gpt4":
            # openai_msgs = [SystemMessage(content=system_prompt_override)] + memory.chat_memory.messages
            # print(openai_msgs)
            
            chat_history = []
            for msg in memory.chat_memory.messages:
                if isinstance(msg, HumanMessage):
                    chat_history.append({"role": "user", "content": msg.content})
                elif isinstance(msg, AIMessage):
                    chat_history.append({"role": "assistant", "content": msg.content})

            messages = [{"role": "system", "content": system_prompt}] + chat_history + [{"role": "assistant", "content": "<response>"}]
            
            response = llm.responses.create(
                                            model="o4-mini-2025-04-16",
                                            input=messages
                                            )
            
            raw_output = response.output_text
        
        elif aimodel == "gemini":
            
            response = google_client.models.generate_content(
            model="gemini-2.5-flash-preview-04-17",
            config=types.GenerateContentConfig(
                system_instruction=system_prompt_override),
            contents=[
                        types.Part.from_text(text=msg.content)
                        for msg in memory.chat_memory.messages
                    ]
            )
            raw_output = response.text
        
    else:
        
        chat_history = []
        for msg in memory.chat_memory.messages:
            if isinstance(msg, HumanMessage):
                chat_history.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                chat_history.append({"role": "assistant", "content": msg.content})
        messages = [{"role": "system", "content": system_prompt_override}] + chat_history + [{"role": "assistant", "content": "<response>"}]
        text = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        inputs = tokenizer([text], return_tensors="pt")
        outputs = model.generate(**inputs, max_new_tokens=200)
        raw_output = tokenizer.decode(outputs[0], skip_special_tokens=True)

    response_text = clean_response(raw_output)
    memory.chat_memory.add_ai_message(response_text)
    save_messages_to_file(session_id, memory.chat_memory.messages)
    stop_time = time.time()
    print("Time Taken for LLM : ", (stop_time-start_time)/1e3 , " Seconds")
    return response_text

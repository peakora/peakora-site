// ------------------------------------------------------
// PEAKORA — Assistant Modal + Conversation Flow
// ------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
 // MOBILE MENU TOGGLE
const menuToggle = document.getElementById("menuToggle");
const nav = document.querySelector(".nav");

menuToggle?.addEventListener("click", () => {
  nav.classList.toggle("nav-open");
});

  // --------------------
  // DOM ELEMENTS
  // --------------------
  const assistantButton = document.getElementById("assistantButton");
  const assistantModalOverlay = document.getElementById("assistantModal");
  const assistantMessages = document.getElementById("assistantMessages");
  const assistantInput = document.getElementById("assistantInput");
  const assistantSend = document.getElementById("assistantSend");
  const assistantClose = document.getElementById("assistantClose");

  // --------------------
  // STATE
  // --------------------
  let conversationStage = 1; // 1: ask name, 2: get name, 3: first follow-up, 4: second, 5: third+redirect, 6: final
  let userName = "";
  let currentIntent = null;
  let usedSmartReply = false;
  let typingTimeout = null;

  // --------------------
  // TYPING INDICATOR
  // --------------------
  function showTypingIndicator() {
    let existing = assistantMessages.querySelector(".assistant-typing");
    if (existing) return;

    const typing = document.createElement("div");
    typing.classList.add("assistant-message", "assistant-typing");
    typing.innerHTML = `<span class="typing-dots"><span></span><span></span><span></span></span>`;
    assistantMessages.appendChild(typing);
    scrollSmooth();
  }

  function hideTypingIndicator() {
    const typing = assistantMessages.querySelector(".assistant-typing");
    if (typing) typing.remove();
  }

  // --------------------
  // SCROLL
  // --------------------
  function scrollSmooth() {
    if (!assistantMessages) return;
    assistantMessages.scrollTo({
      top: assistantMessages.scrollHeight,
      behavior: "smooth",
    });
  }

  // --------------------
  // MESSAGE HELPERS
  // --------------------
  function addAssistantMessage(text) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("assistant-message", "assistant");

    const p = document.createElement("p");
    p.textContent = text;
    wrapper.appendChild(p);

    assistantMessages.appendChild(wrapper);
    scrollSmooth();
  }

  function addUserMessage(text) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("assistant-message", "user");

    const p = document.createElement("p");
    p.textContent = text;
    wrapper.appendChild(p);

    assistantMessages.appendChild(wrapper);
    scrollSmooth();
  }

  function addAssistantMessageWithDelay(text, delay = 600) {
    showTypingIndicator();
    if (typingTimeout) clearTimeout(typingTimeout);

    typingTimeout = setTimeout(() => {
      hideTypingIndicator();
      addAssistantMessage(text);
    }, delay);
  }

   // --------------------
  // SMART REPLIES (clean, delayed, no duplication)
  // --------------------
  function clearSmartReplies() {
    const existing = assistantMessages.querySelectorAll(".assistant-smart-replies");
    existing.forEach((el) => el.remove());
  }

  function createSmartReplyButton(label, value) {
    const btn = document.createElement("button");
    btn.classList.add("assistant-smart-reply");
    btn.textContent = label;

    btn.addEventListener("click", () => {
      clearSmartReplies();
      handleSend(value, true); // Only handleSend — no addUserMessage duplication
    });

    return btn;
  }

  function showSmartRepliesForName() {
    setTimeout(() => {
      clearSmartReplies();

      const container = document.createElement("div");
      container.classList.add("assistant-smart-replies");

      container.appendChild(createSmartReplyButton("I prefer not to share my name", "I prefer not to share my name"));
      container.appendChild(createSmartReplyButton("Call me friend", "Call me friend"));
      container.appendChild(createSmartReplyButton("I'll share it later", "I'll share it later"));

      assistantMessages.appendChild(container);
      scrollSmooth();
    }, 600); // Delay to appear after assistant message
  }

  function showSmartRepliesForIntent() {
    setTimeout(() => {
      clearSmartReplies();

      const container = document.createElement("div");
      container.classList.add("assistant-smart-replies");

      container.appendChild(createSmartReplyButton("I feel overwhelmed", "I feel overwhelmed"));
      container.appendChild(createSmartReplyButton("My routine is off", "My routine is off"));
      container.appendChild(createSmartReplyButton("I just need something small", "I just need a small step"));

      assistantMessages.appendChild(container);
      scrollSmooth();
    }, 600); // Delay to appear after assistant message
  }

  // --------------------
  // MODAL OPEN/CLOSE
  // --------------------
  function openAssistant() {
    assistantModalOverlay.classList.add("open");

    if (!assistantMessages || assistantMessages.children.length === 0) {
      startConversation();
    }

    assistantInput.focus();
  }

  function closeAssistant() {
    assistantModalOverlay.classList.remove("open");
  }

  // --------------------
  // CONVERSATION START
  // --------------------
  function startConversation() {
    conversationStage = 1;
    userName = "";
    currentIntent = null;
    usedSmartReply = false;
    clearSmartReplies();
    assistantMessages.innerHTML = "";

    addAssistantMessageWithDelay("Hi I'm Peakora");
    setTimeout(() => {
      addAssistantMessageWithDelay("How can I help you today?");
    }, 700);
  }

  // NOTE: handleSend, intent detection, stages, emotional flows,
  // redirect block, and event listeners come in Parts 2–4.
  // ------------------------------------------------------
  // CONVERSATION ENGINE — HANDLE USER INPUT
  // ------------------------------------------------------
   function handleSend(forcedText = null, fromSmartReply = false) {
  const text = forcedText || assistantInput.value.trim();
  if (!text) return;

  // Only show the user bubble once
  if (!fromSmartReply) {
    addUserMessage(text);
  }

  assistantInput.value = "";
  clearSmartReplies();

  // --------------------
  // STAGE 1 — FIRST USER MESSAGE → ASK NAME
  // --------------------
  if (conversationStage === 1) {
    addAssistantMessageWithDelay(
      "I'm here with you. What name feels right for me to call you?"
    );
    showSmartRepliesForName();
    conversationStage = 2;
    return;
  }

  // --------------------
  // STAGE 2 — GET NAME (OR CHOOSE NOT TO SHARE)
  // --------------------
  if (conversationStage === 2) {
    const lower = text.toLowerCase();

    // If user clicked a smart reply about not sharing name
    if (fromSmartReply &&
        (lower.includes("prefer not to share") ||
         lower.includes("call me friend") ||
         lower.includes("share it later"))) {

      userName = "friend";

      addAssistantMessageWithDelay(
        "Thank you for being here with me. What has been weighing on you lately?"
      );
      showSmartRepliesForIntent();
      conversationStage = 3;
      return;
    }

    // Manual text: validate as a name
    if (!looksLikeName(text)) {
      addAssistantMessageWithDelay(
        "That is okay. You can share a name, a nickname, or anything you are comfortable with."
      );
      showSmartRepliesForName();
      return;
    }

    // Valid name
    userName = text;
    addAssistantMessageWithDelay(
      `Thank you, ${userName}. What has been weighing on you lately?`
    );
    showSmartRepliesForIntent();
    conversationStage = 3;
    return;
  }

  // --------------------
  // STAGE 3 — INTENT DETECTION + FIRST FOLLOW UP
  // --------------------
  if (conversationStage === 3) {
    let intent;

    if (fromSmartReply) {
      addUserMessage(text); // show the chosen smart reply once here
      intent = mapSmartReplyToIntent(text);
    } else {
      if (!looksLikeProblem(text)) {
        addAssistantMessageWithDelay(
          `I want to understand you clearly, ${userName}. Tell me what you are feeling in a few simple words.`
        );
        showSmartRepliesForIntent();
        return;
      }
      intent = detectIntent(text);
    }

    currentIntent = intent;
    usedSmartReply = false;

    respondFirstStepForIntent(intent);
    conversationStage = 4;
    return;
  }

  // --------------------
  // STAGE 4 — SECOND EMOTIONAL FOLLOW UP
  // --------------------
  if (conversationStage === 4) {
    respondSecondStepForIntent(currentIntent || "general");
    conversationStage = 5;
    return;
  }

  // --------------------
  // STAGE 5 — THIRD EMOTIONAL FOLLOW UP + REDIRECT
  // --------------------
  if (conversationStage === 5) {
    respondThirdStepForIntent(currentIntent || "general");

    setTimeout(() => {
      addRedirectBlock();
      conversationStage = 6;
    }, 1200);

    return;
  }

  // --------------------
  // STAGE 6 — FINAL SUPPORTIVE MESSAGE
  // --------------------
  if (conversationStage === 6) {
    addAssistantMessageWithDelay(
      `I am still here with you, ${userName}. Whenever you are ready, we can continue together.`
    );
    return;
  }
}

  // ------------------------------------------------------
  // INTENT DETECTION
  // ------------------------------------------------------
  function detectIntent(text) {
    const t = text.toLowerCase();

    if (t.includes("overwhelm") || t.includes("too much") || t.includes("stress"))
      return "overwhelm";

    if (t.includes("routine") || t.includes("schedule") || t.includes("habits"))
      return "routine";

    if (t.includes("calm") || t.includes("anxiety") || t.includes("peace"))
      return "calm";

    if (t.includes("small") || t.includes("step") || t.includes("tiny"))
      return "small_step";

    return "general";
  }

  function mapSmartReplyToIntent(text) {
    const t = text.toLowerCase();

    if (t.includes("overwhelmed")) return "overwhelm";
    if (t.includes("routine")) return "routine";
    if (t.includes("small")) return "small_step";

    return "general";
  }
  // ------------------------------------------------------
  // EMOTIONAL FLOW — FIRST, SECOND, THIRD FOLLOW‑UPS
  // ------------------------------------------------------

  // FIRST FOLLOW-UP (after detecting intent)
  function respondFirstStepForIntent(intent) {
    if (intent === "calm") {
      addAssistantMessageWithDelay(
        `Thank you for telling me, ${userName}. What part of your day feels the heaviest right now?`
      );
      return;
    }

    if (intent === "routine") {
      addAssistantMessageWithDelay(
        `Got it, ${userName}. Which part of your routine feels most out of sync right now — mornings or evenings?`
      );
      return;
    }

    if (intent === "overwhelm") {
      addAssistantMessageWithDelay(
        `You’re carrying a lot, ${userName}. What feels most overwhelming for you at this moment?`
      );
      return;
    }

    if (intent === "small_step") {
      addAssistantMessageWithDelay(
        `We can start gently, ${userName}. Do you want something calming, energizing, or grounding as a first step?`
      );
      return;
    }

    addAssistantMessageWithDelay(
      `Thank you for sharing that, ${userName}. Tell me a little more about what you’re feeling right now.`
    );
  }

  // SECOND FOLLOW-UP (micro-guidance)
 function respondSecondStepForIntent(intent) {
  const last = assistantMessages
    .querySelector(".assistant-message.user:last-child")
    ?.textContent.toLowerCase();

  let message = "";

  // SMALL STEP INTENT
  if (intent === "small_step") {
    if (last.includes("calm") || last.includes("calming")) {
      message =
        "I hear you. Let’s slow things down together for a moment. Place one hand on your chest, breathe in gently, and feel your body soften just a little.";
    } else if (last.includes("energ") || last.includes("energy")) {
      message =
        "Alright, let’s wake your system up a bit. Roll your shoulders back, lift your chin slightly, and take one deep, sharp inhale through your nose.";
    } else if (last.includes("ground") || last.includes("grounding")) {
      message =
        "Okay. Look around you and name one thing you can see, one thing you can touch, and one thing you can hear. You are doing great.";
    } else {
      message =
        "Thank you for trusting me with that. Let’s take one small step together. Relax your jaw, drop your shoulders, and breathe in slowly through your nose.";
    }
  }

  // CALM INTENT
  else if (intent === "calm") {
    message =
      "You deserve a moment of peace. Try this: breathe in for 4 seconds, hold for 2, and exhale for 6. Let your body know it is safe to soften.";
  }

  // ROUTINE INTENT
  else if (intent === "routine") {
    message =
      "I get it. Routines can feel heavy when life is already full. Let’s choose one tiny anchor for today. Something you can finish in under 2 minutes.";
  }

  // OVERWHELM INTENT
  else if (intent === "overwhelm") {
    message =
      "You are carrying a lot, and it makes sense that it feels like too much. Let’s pause for a moment. What is the one thing that feels the heaviest right now?";
  }

  // GENERAL INTENT
  else {
    message =
      "Thank you for opening up. Even acknowledging how you feel is a meaningful step forward.";
  }

  addAssistantMessageWithDelay(message);

  // SMART REPLIES TO CONTINUE
  setTimeout(() => {
    clearSmartReplies();

    const container = document.createElement("div");
    container.classList.add("assistant-smart-replies");

    container.appendChild(createSmartReplyButton("That helped", "That helped"));
    container.appendChild(createSmartReplyButton("I want more", "I want more"));
    container.appendChild(createSmartReplyButton("I'm ready to continue", "I'm ready to continue"));

    assistantMessages.appendChild(container);
    scrollSmooth();
  }, 800);
}

  // THIRD FOLLOW-UP (emotional reinforcement)
  function respondThirdStepForIntent(intent) {
    if (intent === "small_step") {
      addAssistantMessageWithDelay(
        "You’re doing better than you think. These tiny shifts you’re making — they matter. They’re signals to your mind and body that you’re choosing yourself again."
      );
      return;
    }

    if (intent === "calm") {
      addAssistantMessageWithDelay(
        "I’m really glad you’re taking a moment for yourself. Even a few breaths can change the whole tone of your day."
      );
      return;
    }

    if (intent === "routine") {
      addAssistantMessageWithDelay(
        "You don’t need a perfect routine — just one small promise to yourself that you can keep today. That’s how real change begins."
      );
      return;
    }

    if (intent === "overwhelm") {
      addAssistantMessageWithDelay(
        "You’re not alone in this. Naming what feels heavy is the first step toward making it lighter. I’m here with you."
      );
      return;
    }

    addAssistantMessageWithDelay(
      "Thank you for sharing that with me. You’re taking real steps forward, even if they feel small."
    );
  }

  // ------------------------------------------------------
  // TEXT VALIDATION HELPERS
  // ------------------------------------------------------
  function looksLikeName(text) {
    if (!text) return false;
    const cleaned = text.toLowerCase().trim();

    const bad = [
      "why", "no", "not now", "later", "skip", "none",
      "i don't want to", "i dont want to", "idk", "don't know",
      "dont know", "no name", "anonymous"
    ];

    if (bad.includes(cleaned)) return false;

    return /^[a-zA-Z]{2,20}$/.test(text.trim());
  }

  function looksLikeProblem(text) {
    if (!text) return false;
    const lower = text.toLowerCase().trim();

    const bad = [
      "idk", "i don't know", "dont know", "nothing", "no", "why",
      "later", "not now", "skip", "?"
    ];

    if (bad.includes(lower)) return false;

    return lower.length >= 3;
  }
  // ------------------------------------------------------
  // REDIRECT BLOCK — OFFER FULL PEAKORA ASSISTANT
  // ------------------------------------------------------
  function addRedirectBlock() {
    showTypingIndicator();

    setTimeout(() => {
      hideTypingIndicator();

      const wrapper = document.createElement("div");
      wrapper.classList.add("assistant-message");

      const textEl = document.createElement("p");
      textEl.style.margin = "0 0 8px 0";
      textEl.textContent =
        "For deeper support and a full plan, I can take you to the Peakora Assistant whenever you're ready.";

      const btn = document.createElement("button");
      btn.textContent = "Connect me to Peakora Assistant";
      btn.style.padding = "12px 16px";
      btn.style.background = "#0057ff";
      btn.style.color = "white";
      btn.style.border = "none";
      btn.style.borderRadius = "8px";
      btn.style.cursor = "pointer";
      btn.style.fontSize = "15px";
      btn.style.fontWeight = "600";

      btn.addEventListener("click", () => {
        window.open("https://peakora.github.io/peakora-site/assistant.html", "_blank");
      });

      wrapper.appendChild(textEl);
      wrapper.appendChild(btn);
      assistantMessages.appendChild(wrapper);
      scrollSmooth();
    }, 900);
  }

  // ------------------------------------------------------
  // EVENT LISTENERS
  // ------------------------------------------------------

  // Floating button → open modal
  assistantButton?.addEventListener("click", () => {
    openAssistant();
  });

  // Close button
  assistantClose?.addEventListener("click", () => {
    closeAssistant();
  });

  // Click outside modal closes it
  assistantModalOverlay?.addEventListener("click", (e) => {
    if (e.target === assistantModalOverlay) {
      closeAssistant();
    }
  });

  // Send button
  assistantSend?.addEventListener("click", () => {
    handleSend();
  });

  // Enter key
  assistantInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleSend();
    }
  });

}); // <-- END OF DOMContentLoaded WRAPPER

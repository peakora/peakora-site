// ------------------------------------------------------
// PEAKORA - Unified Modal + UI Interactions
// ------------------------------------------------------


// --------------------
// CONTACT FORM MODAL
// --------------------
const contactForm = document.getElementById("contactForm");
const contactModal = document.getElementById("contactModal");
const contactClose = document.getElementById("contactClose");

if (contactForm) {
  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    contactModal.classList.add("active");

    setTimeout(() => {
      contactModal.classList.remove("active");
    }, 3000);
  });
}

if (contactClose) {
  contactClose.addEventListener("click", () => {
    contactModal.classList.remove("active");
  });
}

if (contactModal) {
  contactModal.addEventListener("click", (e) => {
    if (e.target === contactModal) {
      contactModal.classList.remove("active");
    }
  });
}


// --------------------
// ASSISTANT MODAL
// --------------------

document.addEventListener("DOMContentLoaded", () => {
  const assistantButton = document.getElementById("assistantButton");
  const assistantModalOverlay = document.getElementById("assistantModal");
  const assistantClose = document.getElementById("assistantClose");
  const assistantMessages = document.getElementById("assistantMessages");
  const assistantInput = document.getElementById("assistantInput");
  const assistantSend = document.getElementById("assistantSend");

  // Smart reply container
  const smartReplies = document.createElement("div");
  smartReplies.id = "smartReplies";
  smartReplies.style.display = "none";
  smartReplies.style.gap = "8px";
  smartReplies.style.margin = "8px 0";
  smartReplies.style.flexWrap = "wrap";
  smartReplies.style.padding = "0 12px";
  smartReplies.style.display = "flex";

  assistantMessages.parentNode.insertBefore(smartReplies, assistantMessages.nextSibling);

  // Session reset button - inside modal, top right
  const resetButton = document.createElement("button");
  resetButton.textContent = "Reset chat";
  resetButton.style.position = "absolute";
  resetButton.style.top = "12px";
  resetButton.style.right = "12px";
  resetButton.style.background = "transparent";
  resetButton.style.border = "none";
  resetButton.style.color = "#666";
  resetButton.style.cursor = "pointer";
  resetButton.style.fontSize = "12px";
  resetButton.style.textDecoration = "underline";
  resetButton.style.display = "none";

  // Try to attach to inner modal content if it exists
  const innerModal = document.querySelector("#assistantModal .assistant-modal") || assistantModalOverlay;
  innerModal.appendChild(resetButton);

  // Online status
  const onlineStatus = document.createElement("div");
  onlineStatus.textContent = "Peakora is online";
  onlineStatus.style.fontSize = "12px";
  onlineStatus.style.color = "#4CAF50";
  onlineStatus.style.margin = "8px 0 0 12px";

  assistantMessages.parentNode.insertBefore(onlineStatus, assistantMessages);

  let userName = null;
  let conversationStage = 1;
  let assistantBusy = false;
  let usedSmartReply = false;
  let currentIntent = null;

  function rhythm(text) {
    const base = 900;
    const perChar = 45;
    return base + text.length * perChar;
  }

  function scrollSmooth() {
    assistantMessages.scrollTo({
      top: assistantMessages.scrollHeight,
      behavior: "smooth"
    });
  }

  function addUserMessage(text) {
    const msg = document.createElement("div");
    msg.classList.add("assistant-message", "user");
    msg.textContent = text;
    assistantMessages.appendChild(msg);
    scrollSmooth();
  }

  function showTypingIndicator() {
    if (document.getElementById("typingIndicator")) return;
    assistantBusy = true;
    assistantSend.disabled = true;

    const typing = document.createElement("div");
    typing.id = "typingIndicator";
    typing.classList.add("assistant-message");
    typing.textContent = "Peakora is typing...";
    assistantMessages.appendChild(typing);
    scrollSmooth();
  }

  function hideTypingIndicator() {
    const typing = document.getElementById("typingIndicator");
    if (typing) typing.remove();
    assistantBusy = false;
    assistantSend.disabled = false;
  }

  function addAssistantMessageWithDelay(text) {
    const delay = rhythm(text);
    showTypingIndicator();

    setTimeout(() => {
      hideTypingIndicator();
      const msg = document.createElement("div");
      msg.classList.add("assistant-message");
      msg.textContent = text;
      assistantMessages.appendChild(msg);
      scrollSmooth();
    }, delay);
  }

  function addRedirectBlock() {
    const delay = 1200;
    showTypingIndicator();

    setTimeout(() => {
      hideTypingIndicator();

      const wrapper = document.createElement("div");
      wrapper.classList.add("assistant-message");

      const textEl = document.createElement("p");
      textEl.style.margin = "0 0 8px 0";
      textEl.textContent = "For deeper support and a full plan, I will take you to the Peakora Assistant when you are ready.";

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
        window.open("https://peakora.github.io/peakora-site//assistant.html", "_blank");
      });

      wrapper.appendChild(textEl);
      wrapper.appendChild(btn);
      assistantMessages.appendChild(wrapper);
      scrollSmooth();
    }, delay);
  }

  function isGreeting(text) {
    const t = text.toLowerCase();
    return (
      t.includes("hi") ||
      t.includes("hello") ||
      t.includes("hey") ||
      t.includes("morning") ||
      t.includes("evening")
    );
  }

  function looksLikeName(text) {
    const lower = text.toLowerCase().trim();

    const banned = [
      "why", "because", "idk", "i don't know", "dont know", "no", "none",
      "nothing", "later", "not now", "skip", "no name", "anonymous",
      "help", "what can you do"
    ];

    if (banned.includes(lower)) return false;
    if (lower.length < 2) return false;
    if (lower.split(" ").length > 4) return false;

    return true;
  }

  function looksLikeProblem(text) {
    const lower = text.toLowerCase().trim();

    const banned = [
      "idk", "i don't know", "dont know", "nothing", "no", "why", "later",
      "not now", "skip", "?", "help", "what can you do", "not sure"
    ];

    if (banned.includes(lower)) return false;
    if (lower.length < 3) return false;

    return true;
  }

  function showSmartReplies() {
    smartReplies.innerHTML = "";
    smartReplies.style.display = "flex";

    const replies = [
      "I want to feel calmer today",
      "I need help with my routine",
      "I’m feeling overwhelmed",
      "I want a small step I can take now"
    ];

    replies.forEach(text => {
      const chip = document.createElement("button");
      chip.textContent = text;
      chip.style.padding = "6px 12px";
      chip.style.background = "#f1f1f1";
      chip.style.border = "1px solid #ddd";
      chip.style.borderRadius = "16px";
      chip.style.cursor = "pointer";
      chip.style.fontSize = "13px";
      chip.style.color = "#0f1f3d";

      chip.addEventListener("click", () => {
        assistantInput.value = text;
        usedSmartReply = true;
        handleSend();
      });

      smartReplies.appendChild(chip);
    });
  }

  function hideSmartReplies() {
    smartReplies.style.display = "none";
  }

  function openAssistant() {
    assistantModalOverlay.classList.add("open");
    assistantInput.focus();
    resetButton.style.display = "block";

    if (!assistantMessages.dataset.initialized) {
      setTimeout(() => {
        addAssistantMessageWithDelay("Hi, I am Peakora.\nHow can I help you?");
        showSmartReplies();
      }, 600);

      assistantMessages.dataset.initialized = "true";
    }
  }

  function closeAssistant() {
    assistantModalOverlay.classList.remove("open");
  }

  assistantButton.addEventListener("click", () => {
    if (assistantModalOverlay.classList.contains("open")) {
      closeAssistant();
    } else {
      openAssistant();
    }
  });

  assistantClose.addEventListener("click", closeAssistant);

  assistantModalOverlay.addEventListener("click", (e) => {
    if (e.target === assistantModalOverlay) closeAssistant();
  });

  resetButton.addEventListener("click", () => {
    assistantMessages.innerHTML = "";
    smartReplies.innerHTML = "";
    userName = null;
    conversationStage = 1;
    usedSmartReply = false;
    currentIntent = null;
    assistantMessages.dataset.initialized = "";
    openAssistant();
  });

  assistantInput.addEventListener("input", () => {
    assistantSend.disabled = assistantInput.value.trim().length === 0 || assistantBusy;
  });

  function detectIntent(text) {
    const lower = text.toLowerCase();

    if (
      lower.includes("calm") ||
      lower.includes("anxious") ||
      lower.includes("anxiety") ||
      lower.includes("stress") ||
      lower.includes("stressed")
    ) {
      return "calm";
    }

    if (
      lower.includes("routine") ||
      lower.includes("habit") ||
      lower.includes("schedule") ||
      lower.includes("structure") ||
      lower.includes("morning") ||
      lower.includes("evening")
    ) {
      return "routine";
    }

    if (
      lower.includes("overwhelmed") ||
      lower.includes("overwhelm") ||
      lower.includes("too much") ||
      lower.includes("burnout") ||
      lower.includes("burned out")
    ) {
      return "overwhelm";
    }

    if (
      lower.includes("small step") ||
      lower.includes("first step") ||
      lower.includes("start") ||
      lower.includes("begin")
    ) {
      return "small_step";
    }

    return "general";
  }

  function mapSmartReplyToIntent(text) {
    const lower = text.toLowerCase();

    if (lower.includes("calmer")) return "calm";
    if (lower.includes("routine")) return "routine";
    if (lower.includes("overwhelmed")) return "overwhelm";
    if (lower.includes("small step")) return "small_step";

    return "general";
  }

  function respondFirstStepForIntent(intent) {
    if (intent === "calm") {
      addAssistantMessageWithDelay(
        `Thank you for telling me, ${userName}. What part of your day feels the heaviest right now?`
      );
      return;
    }

    if (intent === "routine") {
      addAssistantMessageWithDelay(
        `Got it, ${userName}. Which part of your routine feels most out of sync right now, mornings or evenings?`
      );
      return;
    }

    if (intent === "overwhelm") {
      addAssistantMessageWithDelay(
        `You are carrying a lot, ${userName}. What feels most overwhelming for you at this moment?`
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
      `Thank you for sharing that, ${userName}. Tell me a little more about what you are feeling right now.`
    );
  }

  function respondSecondStepForIntent(intent) {
    if (intent === "calm") {
      addAssistantMessageWithDelay(
        "Here is a gentle step you can try: take one slow breath in, hold for two seconds, and let it out softly. Notice how your body feels after that."
      );
    } else if (intent === "routine") {
      addAssistantMessageWithDelay(
        "Let us anchor one moment in your day. Choose one small thing you want to do tomorrow that would make your day feel a little more yours."
      );
    } else if (intent === "overwhelm") {
      addAssistantMessageWithDelay(
        "Let us shrink the day a bit. It is okay to let something wait. Choose one thing you can set aside for now so you can breathe."
      );
    } else if (intent === "small_step") {
      addAssistantMessageWithDelay(
        "Here is a small step you can take now: drink a glass of water, stretch your shoulders, and soften your jaw. It helps your body remember that it is safe to slow down."
      );
    } else {
      addAssistantMessageWithDelay(
        "Thank you for opening up. Even small moments of honesty with yourself are a real step forward."
      );
    }

    addRedirectBlock();
  }

  function handleSend() {
    const text = assistantInput.value.trim();
    if (!text || assistantBusy) return;

    hideSmartReplies();
    addUserMessage(text);
    assistantInput.value = "";
    assistantSend.disabled = true;

    // STAGE 1 - GREETING (kept as is)
    if (conversationStage === 1) {
      usedSmartReply = false;

      if (isGreeting(text)) {
        addAssistantMessageWithDelay("It is really nice to meet you. What is your name?");
        conversationStage = 2;
        return;
      }

      addAssistantMessageWithDelay("Before I help you, may I know your name?");
      conversationStage = 2;
      return;
    }

    // STAGE 2 - NAME COLLECTION (kept, no skip)
    if (conversationStage === 2) {
      usedSmartReply = false;

      const lower = text.toLowerCase().trim();

      const optOutTriggers = [
        "why", "no", "not now", "later", "skip", "none",
        "i don't want to", "i dont want to", "idk", "don't know",
        "dont know", "no name", "anonymous"
      ];

      if (optOutTriggers.includes(lower)) {
        addAssistantMessageWithDelay("No worries, you can stay anonymous. What would you like support with today?");
        userName = "friend";
        conversationStage = 3;
        showSmartReplies();
        return;
      }

      if (lower.includes("why")) {
        addAssistantMessageWithDelay("I ask your name so I can speak to you personally. What should I call you?");
        return;
      }

      if (!looksLikeName(text)) {
        addAssistantMessageWithDelay("I did not quite catch that as a name. What name should I use for you?");
        return;
      }

      userName = text;
      addAssistantMessageWithDelay(`Thank you, ${userName}. What would you like support with today?`);
      conversationStage = 3;
      showSmartReplies();
      return;
    }

    // STAGE 3 - FIRST INTENT AND FOCUSED QUESTION
    if (conversationStage === 3) {
      let intent;

      if (usedSmartReply) {
        intent = mapSmartReplyToIntent(text);
      } else {
        if (!looksLikeProblem(text)) {
          addAssistantMessageWithDelay(
            `I want to understand you clearly, ${userName}. Tell me what you are feeling in a few simple words.`
          );
          showSmartReplies();
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

    // STAGE 4 - MICRO GUIDANCE AND REDIRECT BLOCK
    if (conversationStage === 4) {
      respondSecondStepForIntent(currentIntent || "general");
      conversationStage = 5;
      return;
    }

    // STAGE 5 - AFTER REDIRECT SUGGESTION
    if (conversationStage === 5) {
      addAssistantMessageWithDelay(
        `I am still here with you, ${userName}. You can continue with the Peakora Assistant whenever you feel ready.`
      );
      return;
    }
  }

  assistantSend.addEventListener("click", handleSend);

  assistantInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });
});

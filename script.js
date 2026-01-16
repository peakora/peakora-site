// ------------------------------------------------------
// PEAKORA — Unified Modal + UI Interactions
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

  let userName = null;
  let conversationStage = 1; 
  // 1 = greeting
  // 2 = name collection
  // 3 = problem collection
  // 4 = redirect stage

  function rhythm(text) {
    const base = 900;
    const perChar = 45;
    return base + text.length * perChar;
  }

  function addUserMessage(text) {
    const msg = document.createElement("div");
    msg.classList.add("assistant-message", "user");
    msg.textContent = text;
    assistantMessages.appendChild(msg);
    assistantMessages.scrollTop = assistantMessages.scrollHeight;
  }

  function showTypingIndicator() {
    if (document.getElementById("typingIndicator")) return;
    const typing = document.createElement("div");
    typing.id = "typingIndicator";
    typing.classList.add("assistant-message");
    typing.textContent = "Peakora is typing…";
    assistantMessages.appendChild(typing);
    assistantMessages.scrollTop = assistantMessages.scrollHeight;
  }

  function hideTypingIndicator() {
    const typing = document.getElementById("typingIndicator");
    if (typing) typing.remove();
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
      assistantMessages.scrollTop = assistantMessages.scrollHeight;
    }, delay);
  }

  function addRedirectButton() {
    const delay = 1200;
    showTypingIndicator();

    setTimeout(() => {
      hideTypingIndicator();

      const wrapper = document.createElement("div");
      wrapper.classList.add("assistant-message");

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
        window.open("https://peakora.com/assistant", "_blank");
      });

      wrapper.appendChild(btn);
      assistantMessages.appendChild(wrapper);
      assistantMessages.scrollTop = assistantMessages.scrollHeight;
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
      "why",
      "because",
      "idk",
      "i don't know",
      "dont know",
      "no",
      "none",
      "nothing",
      "later",
      "not now",
      "skip",
      "no name",
      "anonymous",
      "help",
      "what can you do"
    ];

    if (banned.includes(lower)) return false;
    if (lower.length < 2) return false;
    if (lower.split(" ").length > 4) return false;

    return true;
  }

  function looksLikeProblem(text) {
    const lower = text.toLowerCase().trim();

    const banned = [
      "idk",
      "i don't know",
      "dont know",
      "nothing",
      "no",
      "why",
      "later",
      "not now",
      "skip",
      "?",
      "help",
      "what can you do",
      "not sure"
    ];

    if (banned.includes(lower)) return false;
    if (lower.length < 3) return false;

    return true;
  }

  function openAssistant() {
    assistantModalOverlay.classList.add("open");

    if (!assistantMessages.dataset.initialized) {
      addAssistantMessageWithDelay("Hi, I’m Peakora.\nHow can I help you?");
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

  function handleSend() {
    const text = assistantInput.value.trim();
    if (!text) return;

    addUserMessage(text);
    assistantInput.value = "";

    // -------------------------
    // STAGE 1 — GREETING
    // -------------------------
    if (conversationStage === 1) {
      if (isGreeting(text)) {
        addAssistantMessageWithDelay("It’s really nice to meet you. What’s your name?");
        conversationStage = 2;
        return;
      }

      addAssistantMessageWithDelay("Before I help you, may I know your name?");
      conversationStage = 2;
      return;
    }

    // -------------------------
    // STAGE 2 — NAME COLLECTION
    // -------------------------
    if (conversationStage === 2) {
      const lower = text.toLowerCase().trim();

      const optOutTriggers = [
        "why",
        "no",
        "not now",
        "later",
        "skip",
        "none",
        "i don't want to",
        "i dont want to",
        "idk",
        "don't know",
        "dont know",
        "no name",
        "anonymous"
      ];

      if (optOutTriggers.includes(lower)) {
        addAssistantMessageWithDelay("No worries — you can stay anonymous. What would you like support with?");
        userName = "friend";
        conversationStage = 3;
        return;
      }

      if (lower.includes("why")) {
        addAssistantMessageWithDelay("I ask your name so I can speak to you personally. What should I call you?");
        return;
      }

      if (!looksLikeName(text)) {
        addAssistantMessageWithDelay("I didn’t quite catch that as a name. What name should I use for you?");
        return;
      }

      userName = text;
      addAssistantMessageWithDelay(`Thank you, ${userName}. What would you like support with today?`);
      conversationStage = 3;
      return;
    }

    // -------------------------
    // STAGE 3 — PROBLEM COLLECTION
    // -------------------------
    if (conversationStage === 3) {
      if (!looksLikeProblem(text)) {
        addAssistantMessageWithDelay(`No worries, ${userName}. Take your time — what would you like support with today?`);
        return;
      }

      addAssistantMessageWithDelay(`Thank you for sharing that, ${userName}. I know exactly where you’ll get the support you need.`);
      addRedirectButton();
      conversationStage = 4;
      return;
    }

    // -------------------------
    // STAGE 4 — REDIRECT
    // -------------------------
    if (conversationStage === 4) {
      addAssistantMessageWithDelay(`I’m here with you, ${userName}. You can continue with the Peakora Assistant whenever you're ready.`);
      return;
    }
  }

  assistantSend.addEventListener("click", handleSend);

  assistantInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });
});

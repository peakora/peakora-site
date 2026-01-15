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

  let firstUserMessage = null;
  let userName = null;

  function addAssistantMessage(text) {
    const msg = document.createElement("div");
    msg.classList.add("assistant-message");
    msg.textContent = text;
    assistantMessages.appendChild(msg);
    assistantMessages.scrollTop = assistantMessages.scrollHeight;
  }

  function addUserMessage(text) {
    const msg = document.createElement("div");
    msg.classList.add("assistant-message", "user");
    msg.textContent = text;
    assistantMessages.appendChild(msg);
    assistantMessages.scrollTop = assistantMessages.scrollHeight;
  }

  // ⭐ FIX: force overlay to flex when opened
  function openAssistant() {
    assistantModalOverlay.classList.add("open");
    assistantModalOverlay.style.display = "flex";

    if (!assistantMessages.dataset.initialized) {
      addAssistantMessage("Hi, I’m Peakora.\nHow can I help you?");
      assistantMessages.dataset.initialized = "true";
    }
  }

  // ⭐ FIX: hide overlay properly
  function closeAssistant() {
    assistantModalOverlay.classList.remove("open");
    assistantModalOverlay.style.display = "none";
  }

  function handleSend() {
    const text = assistantInput.value.trim();
    if (!text) return;

    addUserMessage(text);
    assistantInput.value = "";

    if (!firstUserMessage) {
      firstUserMessage = text.toLowerCase();

      const isGreeting =
        firstUserMessage.includes("hi") ||
        firstUserMessage.includes("hello") ||
        firstUserMessage.includes("hey") ||
        firstUserMessage.includes("morning") ||
        firstUserMessage.includes("evening");

      if (isGreeting) {
        setTimeout(() => {
          addAssistantMessage("It’s really nice to meet you.\nBefore we go further, may I know your name?");
        }, 400);
        return;
      }

      setTimeout(() => {
        addAssistantMessage("I can definitely help you with that.\nBefore we go further, may I know your name?");
      }, 400);
      return;
    }

    if (!userName) {
      userName = text;

      const isGreeting =
        firstUserMessage.includes("hi") ||
        firstUserMessage.includes("hello") ||
        firstUserMessage.includes("hey") ||
        firstUserMessage.includes("morning") ||
        firstUserMessage.includes("evening");

      if (isGreeting) {
        setTimeout(() => {
          addAssistantMessage(`Thank you for sharing that, ${userName}.\nWhat would you like support with today?`);
        }, 400);
        return;
      }

      setTimeout(() => {
        addAssistantMessage(`Thank you for sharing that, ${userName}.\nI know exactly where you’ll get the support you need.\nLet me connect you with the Peakora Assistant`);
      }, 400);
      return;
    }

    if (userName) {
      setTimeout(() => {
        addAssistantMessage(`Thank you for sharing that, ${userName}.\nI know exactly where you’ll get the support you need.\nLet me connect you with the Peakora Assistant`);
      }, 400);
    }
  }

  assistantButton.addEventListener("click", openAssistant);
  assistantClose.addEventListener("click", closeAssistant);
  assistantSend.addEventListener("click", handleSend);

  assistantInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });
});

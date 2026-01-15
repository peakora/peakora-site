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
  const assistantModal = document.getElementById("assistantModal");
  const assistantClose = document.getElementById("assistantClose");
  const assistantMessages = document.getElementById("assistantMessages");
  const assistantInput = document.getElementById("assistantInput");
  const assistantSend = document.getElementById("assistantSend");

  function addAssistantMessage(text, isUser = false) {
    const msg = document.createElement("div");
    msg.classList.add("assistant-message");
    if (isUser) msg.classList.add("user");
    msg.textContent = text;
    assistantMessages.appendChild(msg);
    assistantMessages.scrollTop = assistantMessages.scrollHeight;
  }

  function openAssistant() {
    assistantModal.classList.add("open");

    if (!assistantMessages.dataset.initialized) {
      addAssistantMessage("You’re here. That’s enough for now. What feels present for you?");
      assistantMessages.dataset.initialized = "true";
    }
  }

  function closeAssistant() {
    assistantModal.classList.remove("open");
  }

  function handleSend() {
    const text = assistantInput.value.trim();
    if (!text) return;

    addAssistantMessage(text, true);
    assistantInput.value = "";

    setTimeout(() => {
      addAssistantMessage("Thank you for sharing that. Tell me a bit more about how this feels for you.");
    }, 600);
  }

  assistantButton.addEventListener("click", openAssistant);
  assistantClose.addEventListener("click", closeAssistant);
  assistantSend.addEventListener("click", handleSend);

  assistantInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });

  assistantModal.addEventListener("click", (e) => {
    if (e.target === assistantModal) closeAssistant();
  });
});


// ------------------------------------------------------
// PEAKORA — Unified Modal + UI Interactions
// ------------------------------------------------------

// --------------------
// ASSISTANT MODAL
// --------------------
const agentBtn = document.getElementById("agentBtn");
const agentModal = document.getElementById("agentModal");
const agentClose = document.getElementById("agentClose");
const agentForm = document.getElementById("agentForm");
const agentThanks = document.getElementById("agentThanks");

if (agentBtn) {
  agentBtn.addEventListener("click", () => {
    agentModal.classList.add("active");
  });
}

if (agentClose) {
  agentClose.addEventListener("click", () => {
    agentModal.classList.remove("active");
  });
}

if (agentModal) {
  agentModal.addEventListener("click", (e) => {
    if (e.target === agentModal) {
      agentModal.classList.remove("active");
    }
  });
}

if (agentForm) {
  agentForm.addEventListener("submit", (e) => {
    e.preventDefault();
    agentForm.hidden = true;
    agentThanks.hidden = false;

    setTimeout(() => {
      agentThanks.hidden = true;
      agentForm.hidden = false;
      agentModal.classList.remove("active");
    }, 2500);
  });
}

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

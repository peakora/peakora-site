// ------------------------------------------------------
// PEAKORA — Agent Modal + UI Interactions
// Safe, clean, dependency‑free
// ------------------------------------------------------

// ELEMENTS
const agentBtn = document.getElementById("agentBtn");
const agentModal = document.getElementById("agentModal");
const agentClose = document.getElementById("agentClose");
const agentForm = document.getElementById("agentForm");
const agentThanks = document.getElementById("agentThanks");

// OPEN MODAL
agentBtn.addEventListener("click", () => {
  agentModal.classList.add("active");
  agentModal.setAttribute("aria-hidden", "false");
});

// CLOSE MODAL
agentClose.addEventListener("click", () => {
  agentModal.classList.remove("active");
  agentModal.setAttribute("aria-hidden", "true");
});

// CLOSE WHEN CLICKING OUTSIDE PANEL
agentModal.addEventListener("click", (e) => {
  if (e.target === agentModal) {
    agentModal.classList.remove("active");
    agentModal.setAttribute("aria-hidden", "true");
  }
});

// FORM SUBMIT (FAKE SUCCESS MESSAGE)
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

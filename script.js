// Tally embed loader + agent modal
document.addEventListener('DOMContentLoaded', function () {
  // Tally embed loader
  (function loadTally(){
    var d=document,w="https://tally.so/widgets/embed.js",v=function(){
      if (typeof Tally !== 'undefined') Tally.loadEmbeds();
      else d.querySelectorAll('iframe[data-tally-src]:not([src])').forEach(function(e){ e.src = e.dataset.tallySrc; });
    };
    if (typeof Tally !== 'undefined') v();
    else if (!d.querySelector('script[src="'+w+'"]')) {
      var s = d.createElement('script'); s.src = w; s.onload = v; s.onerror = v; d.body.appendChild(s);
    }
  })();

  // Agent modal
  var agentBtn = document.getElementById('agentBtn');
  var agentModal = document.getElementById('agentModal');
  var agentClose = document.getElementById('agentClose');
  var agentForm = document.getElementById('agentForm');
  var agentThanks = document.getElementById('agentThanks');

  if (agentBtn && agentModal) {
    agentBtn.addEventListener('click', function(){
      agentModal.classList.add('open');
      agentModal.setAttribute('aria-hidden','false');
    });
  }
  if (agentClose) {
    agentClose.addEventListener('click', function(){
      agentModal.classList.remove('open');
      agentModal.setAttribute('aria-hidden','true');
    });
  }
  if (agentForm) {
    agentForm.addEventListener('submit', function(e){
      e.preventDefault();
      agentForm.style.display = 'none';
      agentThanks.hidden = false;
      setTimeout(function(){
        agentModal.classList.remove('open');
        agentModal.setAttribute('aria-hidden','true');
        agentForm.reset();
        agentForm.style.display = '';
        agentThanks.hidden = true;
      }, 1400);
    });
  }
});

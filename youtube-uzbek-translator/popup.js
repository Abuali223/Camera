const defaults = { enabled: true, mode: 'dual', fontSize: 22 };

const $enabled = document.getElementById('enabled');
const $mode = document.getElementById('mode');
const $fontSize = document.getElementById('fontSize');
const $fontVal = document.getElementById('fontVal');

chrome.storage.sync.get(defaults, (s) => {
  $enabled.checked = s.enabled;
  $mode.value = s.mode;
  $fontSize.value = s.fontSize;
  $fontVal.textContent = s.fontSize;
});

$enabled.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: $enabled.checked });
});

$mode.addEventListener('change', () => {
  chrome.storage.sync.set({ mode: $mode.value });
});

$fontSize.addEventListener('input', () => {
  $fontVal.textContent = $fontSize.value;
  chrome.storage.sync.set({ fontSize: Number($fontSize.value) });
});

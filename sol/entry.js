/* Keep the new door's keyboard activation local to the shared gallery. */
(() => {
  'use strict';
  const door = document.getElementById('openSolBtn');
  if (!door) return;
  door.addEventListener('keydown', event => {
    if (event.key === 'Enter') event.stopPropagation();
    if (event.key === ' ') {
      event.preventDefault(); event.stopPropagation(); door.click();
    }
  });
})();

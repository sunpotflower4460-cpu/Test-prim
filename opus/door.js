/* Shared gallery: Space opens a focused door that is a link, as it does for the
   doors that are buttons. (Enter already follows a link natively.) */
(() => {
  "use strict";
  document.addEventListener("keydown", event => {
    if (event.key !== " " || event.defaultPrevented) return;
    const door = event.target && event.target.closest && event.target.closest("a.launcher-button");
    if (!door) return;
    event.preventDefault(); event.stopPropagation();
    door.click();
  }, true);
})();

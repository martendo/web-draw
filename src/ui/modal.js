const Modal = {
  // Current modal z-index - newest modal should always show up at the top
  index: 99,
  
  open(id) {
    const modal = document.getElementById(id);
    // `grid` centres content without translate but others don't...
    modal.style.display = "grid";
    modal.style.zIndex = ++this.index;
  },
  close(id) {
    document.getElementById(id).style.display = "none";
    const modals = document.getElementsByClassName("modal");
    for (var i = 0; i < modals.length; i++) {
      const modal = modals[i];
      if (modal.style.display !== "none" && modal.style.display !== "") return;
    }
    this.index = 99;
  }
};

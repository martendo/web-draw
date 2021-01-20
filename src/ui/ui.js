// Copy text to the clipboard
function copyText(text, event = null) {
  navigator.clipboard.writeText(text, null, () => {
    console.log("navigator.clipboard.writeText failed");
    const textarea = document.createElement("textarea");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  });
  if (event) {
    const tooltip = document.getElementById("tooltip");
    tooltip.textContent = "Copied!";
    tooltip.style.left = (event.clientX + 20) + "px";
    tooltip.style.top = (event.clientY - 30) + "px";
    tooltip.style.visibility = "visible";
    setTimeout(() => {
      tooltip.style.visibility = "hidden";
    }, 1000);
  }
}

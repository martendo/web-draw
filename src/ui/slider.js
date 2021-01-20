// All the slider inputs to set up
const TOOL_SETTINGS_SLIDERS = [
  { id: "penWidth", defaultVal: 10 },
  { id: "opacity", defaultVal: 100 },
  { id: "fillThreshold", defaultVal: 15 }
];

const Slider = {
  current: null,
  
  // Callback functions
  CALLBACKS: {
    "updateColourValueAlpha": updateColourValueAlpha
  },
  
  update(event) {
    if (!this.current) return;
    const input = document.getElementById(this.current + "Input");
    const rect = input.getBoundingClientRect();
    const dx = event.clientX - rect.left;
    var fraction = dx / rect.width;
    const min = parseFloat(input.dataset.min);
    const value = Math.min(Math.max((fraction * (input.dataset.width - min)) + min, min), input.dataset.max);
    this.setValue(this.current, value);
  },
  setValue(id, value, doCallback = true) {
    const input = document.getElementById(id + "Input");
    value = value.toFixed(input.dataset.dplaces);
    input.dataset.value = value;
    document.getElementById(id + "Value").textContent = value;
    const min = parseFloat(input.dataset.min);
    document.getElementById(id + "Bar").style.width = Math.max(Math.min((value - min) / (parseFloat(input.dataset.width) - min) * 100, 100), 0) + "%";
    if (input.dataset.callback && doCallback) this.CALLBACKS[input.dataset.callback](value);
  },
  doArrow(id, dir) {
    const slider = document.getElementById(id + "Input");
    const newVal = Math.min(Math.max(parseFloat(slider.dataset.value) + (dir === "up" ? 1 : -1), slider.dataset.min), slider.dataset.max);
    this.setValue(id, newVal);
  }
};

function updateColourValueAlpha(value) {
  for (var i = 0; i < 2; i++) {
    const colourValue = document.getElementById(`penColour${i}Value`);
    colourValue.value = colourValue.value.slice(0, -2) + ("0" + Math.round(value / 100 * 255).toString(16)).slice(-2);
    document.getElementById("penColour" + i).style.backgroundColor = colourValue.value;
  }
}

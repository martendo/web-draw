# Web Draw To-Do
## Bug fixes
- Handle race conditions
  - Timestamp? Action number?
## (Hopefully) Coming in the near future
- Selection copy buffer, for each client
  - Eliminate unnecessary raw image data of paste image actions in canvas files
  - Allow pasting copied data after switching to another tool
- Editing of shapes and lines in a similar fashion to selections
- Rotation of selections
- Edit settings of actions in action history (change colour, opacity, etc.)
## Later
- Make the canvas container/area a `<canvas>` and draw the "canvas" (image) on that
  - Allows better/nicer manipulation of view
    - Panning that isn't awkward (scrolling is how it's done now)
    - Zoom that isn't just CSS `scale()`
- When changing zoom, keep the pixel at the cursor before the zoom at the cursor after the zoom
## Probably even later
- Multiple layers
  - Requires huge changes, but layers are super useful
- Text
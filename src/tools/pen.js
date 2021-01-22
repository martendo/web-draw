const Pen = {
  // Add a point to the current stroke and draw it
  draw(x, y) {
    if (currentAction.type !== "stroke") return false;
    const lastPoint = currentAction.data.points[currentAction.data.points.length - 1];
    if (currentAction.data.points.length > 0 && x === lastPoint[0] && y === lastPoint[1]) return;
    Client.sendMessage({
      type: "add-stroke",
      clientId: Client.id,
      pos: [x, y]
    });
    currentAction.data.points.push([x, y]);
    this.drawStroke(thisCtx, currentAction.data);
  },
  // Add a point to another client's current stroke and draw it
  drawClientStroke(clientId) {
    const action = clientActions.get(clientId);
    if (action.type !== "stroke") return false;
    const ctx = clientCanvasses.get(clientId).getContext("2d");
    this.drawStroke(ctx, action.data);
  },
  // Commit a stroke to the session canvas (copy it then erase it)
  commitStroke(srcCanvas, stroke, user = true) {
    this.drawStroke(sessionCtx, stroke, false);
    srcCanvas.getContext("2d").clearRect(0, 0, srcCanvas.width, srcCanvas.height);
    if (user) {
      ActionHistory.addToUndo({
        type: "stroke",
        stroke: {...stroke}
      });
    }
  },
  
  // Draw a full stroke
  drawStroke(ctx, stroke, user = true) {
    if (user) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    var p0 = stroke.points[0],
        p1 = stroke.points[1];
    
    ctx.strokeStyle = stroke.colour;
    ctx.lineCap = CAPS[stroke.caps];
    ctx.lineWidth = stroke.size;
    ctx.globalAlpha = stroke.opacity;
    ctx.globalCompositeOperation = user ? DEFAULT_COMP_OP : COMP_OPS[stroke.compOp];
    
    ctx.beginPath();
    ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
    
    for (var i = 0; i < stroke.points.length - 1; i++) {
      const p0 = stroke.points[i], p1 = stroke.points[i + 1];
      const midPoint = [
        (p0[0] + p1[0]) / 2,
        (p0[1] + p1[1]) / 2
      ];
      ctx.quadraticCurveTo(p0[0], p0[1], midPoint[0], midPoint[1]);
    }
    ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
    ctx.stroke();
    
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = DEFAULT_COMP_OP;
  }
};

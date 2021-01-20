const Line = {
  draw(line, ctx, user = true) {
    ctx.strokeStyle = line.colour;
    ctx.lineCap = CAPS[line.caps];
    ctx.lineWidth = line.width;
    ctx.globalAlpha = line.opacity;
    ctx.globalCompositeOperation = user ? DEFAULT_COMP_OP : COMP_OPS[line.compOp];
    
    ctx.beginPath();
    ctx.moveTo(line.x0, line.y0);
    ctx.lineTo(line.x1, line.y1);
    ctx.stroke();
    
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = DEFAULT_COMP_OP;
  }
};

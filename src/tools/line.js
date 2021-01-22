const Line = {
  draw(line, ctx, save) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    ctx.strokeStyle = line.colour;
    ctx.lineCap = CAPS[line.caps];
    ctx.lineWidth = line.width;
    ctx.globalAlpha = line.opacity;
    
    ctx.beginPath();
    ctx.moveTo(line.x0, line.y0);
    ctx.lineTo(line.x1, line.y1);
    ctx.stroke();
    
    ctx.globalAlpha = 1;
    
    Canvas.update(ctx.canvas, line.compOp, save);
  }
};

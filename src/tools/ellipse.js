const Ellipse = {
  draw(ellipse, ctx, save) {
    if (!ellipse.outline && !ellipse.fill) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    const x = (ellipse.x + (ellipse.x + ellipse.width)) / 2;
    const y = (ellipse.y + (ellipse.y + ellipse.height)) / 2;
    const radiusX = Math.abs(x - ellipse.x);
    const radiusY = Math.abs(y - ellipse.y);
    
    ctx.globalAlpha = ellipse.opacity;
    
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, 0, 0, 2 * Math.PI);
    if (ellipse.fill) {
      ctx.fillStyle = ellipse.colours.fill;
      ctx.fill();
    }
    if (ellipse.outline) {
      ctx.strokeStyle = ellipse.colours.outline;
      ctx.lineWidth = ellipse.lineWidth;
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
    
    Canvas.update(ctx.canvas, ellipse.compOp, save);
  }
};

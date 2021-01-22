const Rect = {
  draw(rect, ctx, save) {
    if (!rect.outline && !rect.fill) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    const x = rect.lineWidth % 2 !== 0 ? rect.x + 0.5 : rect.x;
    const y = rect.lineWidth % 2 !== 0 ? rect.y + 0.5 : rect.y;
    
    ctx.globalAlpha = rect.opacity;
    
    ctx.beginPath();
    ctx.rect(x, y, rect.width, rect.height);
    if (rect.fill) {
      ctx.fillStyle = rect.colours.fill;
      ctx.fill();
    }
    if (rect.outline) {
      ctx.strokeStyle = rect.colours.outline;
      ctx.lineWidth = rect.lineWidth;
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
    
    Canvas.update(ctx.canvas, rect.compOp, save);
  }
};

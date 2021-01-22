const Rect = {
  draw(rect, ctx, user = true) {
    if (!rect.outline && !rect.fill) return;
    if (user) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    const x = rect.lineWidth % 2 !== 0 ? rect.x + 0.5 : rect.x;
    const y = rect.lineWidth % 2 !== 0 ? rect.y + 0.5 : rect.y;
    
    ctx.globalAlpha = rect.opacity;
    if (!user) ctx.globalCompositeOperation = COMP_OPS[rect.compOp];
    
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
    ctx.globalCompositeOperation = DEFAULT_COMP_OP;
    
    Canvas.update(rect.compOp);
  }
};

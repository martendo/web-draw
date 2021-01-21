const Rect = {
  draw(rect, ctx) {
    if (!rect.outline && !rect.fill) return;
    
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
    
    Canvas.update(rect.compOp);
  }
};
